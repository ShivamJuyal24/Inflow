import type { gmail_v1 } from "googleapis";
import type { Email } from "../types/email";

// Cap on how much body text we send to the LLM classifier — keeps token
// usage predictable and avoids marketing emails' legal boilerplate
// drowning out the actual signal (subject/offer/CTA usually appear early).
const MAX_LLM_BODY_LENGTH = 2000;

/**
 * Case-insensitive header lookup. Gmail header names are inconsistent in
 * casing across senders (e.g. "From" vs "from"), so we normalize before
 * comparing.
 */
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return (
    headers?.find(
      (header) => header.name?.toLowerCase() === name.toLowerCase()
    )?.value ?? ""
  );
}

/**
 * Gmail returns body content as base64url (RFC 4648 §5), not standard
 * base64 — it uses '-'/'_' instead of '+'/'/' and omits padding. We
 * normalize to standard base64 before decoding.
 *
 * Wrapped in try/catch: malformed or truncated data.data from Gmail
 * (rare, but happens on some forwarded/bounced messages) would otherwise
 * throw and take down the whole fetch batch for one bad email.
 */
function decodeBase64Url(data: string): string {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf-8");
  } catch (err) {
    console.error("Failed to decode base64url body part:", err);
    return "";
  }
}

/**
 * Decodes the common HTML named entities that show up in real-world
 * marketing/transactional email. Not exhaustive (there are 2000+ named
 * entities in the HTML spec) — deliberately limited to the ones that
 * actually appear in practice, since a rare miss just leaves a literal
 * "&something;" in the text rather than breaking anything.
 */
function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };

  let result = text;

  for (const [entity, replacement] of Object.entries(namedEntities)) {
    result = result.replaceAll(entity, replacement);
  }

  return (
    result
      // Numeric decimal entities, e.g. &#8199; (the zero-width/invisible
      // spacer characters common in marketing email tracking pixels)
      .replace(/&#\d+;/g, " ")
      // Numeric hex entities, e.g. &#x1F600;
      .replace(/&#x[0-9a-f]+;/gi, " ")
      // Anything else that looks like an entity but wasn't matched above
      .replace(/&[a-z]+;/gi, " ")
  );
}

/**
 * Strips an HTML email body down to readable text.
 *
 * Order matters here:
 * 1. Remove <style>/<script> blocks first — their contents aren't
 *    readable text and would otherwise get mangled into the output.
 * 2. Remove HTML comments before generic tag-stripping — comments can
 *    contain literal "<" characters (e.g. conditional IE comments) that
 *    would otherwise confuse the generic tag regex and leak raw markup
 *    or "-->" artifacts into the parsed text.
 * 3. Convert block-level tags to newlines before stripping, so
 *    paragraphs/line breaks aren't all collapsed into one run-on line.
 * 4. Strip all remaining tags.
 * 5. Decode entities (must happen after tag stripping, since some
 *    entities are used inside attribute values we've already discarded).
 * 6. Collapse whitespace.
 */
function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ") // collapse runs of spaces/tabs
    .replace(/\n\s*\n\s*\n+/g, "\n\n") // collapse 3+ blank lines to 2
    .trim();
}

/**
 * Recursively walks a Gmail message part tree to find body text.
 *
 * Gmail structures multipart messages as a tree (multipart/alternative,
 * multipart/mixed, multipart/related, etc.), and the plain-text and
 * HTML versions of the same email can appear at different depths
 * depending on the sender's mail client. We do a depth-first search,
 * preferring text/plain wherever it's found, and only falling back to
 * text/html if no usable plain-text part exists anywhere in the tree.
 *
 * Two passes (plain first, then html) rather than "first leaf found" —
 * this avoids picking an early, low-quality text/html part over a
 * plain-text part that appears later in the tree, which does happen
 * with some multipart/mixed structures (e.g. inline images between
 * text sections).
 */
function extractBody(part: gmail_v1.Schema$MessagePart): string {
  const plainText = findBodyByMimeType(part, "text/plain");
  if (plainText.trim()) {
    return plainText;
  }

  const htmlText = findBodyByMimeType(part, "text/html");
  if (htmlText.trim()) {
    return stripHtml(htmlText);
  }

  return "";
}

/**
 * Depth-first search for the first part matching the given mime type
 * that has decodable body data. Skips parts without body.data (e.g.
 * attachments referenced by attachmentId, which require a separate
 * Gmail API call to fetch and aren't needed for classification).
 */
function findBodyByMimeType(
  part: gmail_v1.Schema$MessagePart,
  mimeType: "text/plain" | "text/html"
): string {
  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.parts) {
    for (const childPart of part.parts) {
      const found = findBodyByMimeType(childPart, mimeType);
      if (found.trim()) {
        return found;
      }
    }
  }

  return "";
}

/**
 * Produces a trimmed-down version of the body suitable for sending to
 * an LLM: strips tracking/CTA URLs (which are pure noise for
 * classification and eat into the token budget) and caps length so a
 * single legal-boilerplate-heavy email can't dominate the context
 * window. Kept separate from the raw parsed body so we still store the
 * full text (useful for display/debugging) while only the cleaned
 * version goes to Groq/Gemini.
 */
export function cleanBodyForClassification(body: string): string {
  return body
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_LLM_BODY_LENGTH);
}

/**
 * Parses the "Date" header into an ISO timestamp. Falls back to the
 * current time if the header is missing or unparseable — some
 * automated/transactional senders omit or malform this header, and
 * `new Date(...).toISOString()` throws on an Invalid Date, which would
 * otherwise crash the whole fetch batch over one bad email.
 */
function parseReceivedAt(headers: gmail_v1.Schema$MessagePartHeader[] | undefined): string {
  const dateHeader = getHeader(headers, "Date");
  // Strip trailing parenthetical timezone names, e.g. "(UTC)" or "(PST)",
  // which some clients append and which JS's Date parser chokes on.
  const cleaned = dateHeader.replace(/\s*\([^)]*\)\s*$/, "");
  const parsed = new Date(cleaned);

  if (isNaN(parsed.getTime())) {
    console.warn(
      `Unparseable or missing Date header ("${dateHeader}") — falling back to current time.`
    );
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

/**
 * Converts a raw Gmail API message into our app-level Email model.
 * Defensive against missing payload/headers, which can occur on
 * malformed or partially-synced messages.
 */
export function parseGmailMessage(message: gmail_v1.Schema$Message): Email {
  const headers = message.payload?.headers;

  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    body: message.payload ? extractBody(message.payload) : "",
    receivedAt: parseReceivedAt(headers),
  };
}