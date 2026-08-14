import { EmailTriageState } from "./state";
import { getMessage, listMessages } from "../services/gmail.service";
import { parseGmailMessage } from "../services/email.parser";
import type { Email } from "../types/email";
import { supabase } from "../config/supabase";
import { groq } from "../config/groq";
import {
  LLMEmailClassificationSchema,
  type EmailClassification,
} from "../types/classification";

/**
 * Maximum number of characters from an email body
 * that will be sent to the LLM.
 *
 * This prevents huge newsletters / HTML emails / tracking
 * links from consuming the Groq token limit.
 */
const MAX_BODY_LENGTH = 5000;

/**
 * Small delay between Groq requests.
 * This helps avoid TPM/rate-limit issues when processing
 * many emails.
 */
const DELAY_BETWEEN_REQUESTS_MS = 1000;

/**
 * Clean an email body before sending it to the LLM.
 *
 * Gmail emails can contain:
 * - huge HTML content
 * - tracking URLs
 * - unsubscribe links
 * - duplicated content
 * - marketing boilerplate
 *
 * We don't need all of that for classification.
 */
function cleanEmailBody(body: string): string {
  if (!body) {
    return "";
  }

  let cleaned = body;

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, "");

  // Remove lines that are basically tracking URLs
  cleaned = cleaned.replace(
    /^\s*\[https?:\/\/.*\]\s*$/gim,
    ""
  );

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\r/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");

  cleaned = cleaned.trim();

  // Limit body size
  if (cleaned.length > MAX_BODY_LENGTH) {
    cleaned =
      cleaned.slice(0, MAX_BODY_LENGTH) +
      "\n\n[Email body truncated for classification]";
  }

  return cleaned;
}

/**
 * Sleep helper used between Groq requests.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/* =========================================================
   FETCH NODE
   ========================================================= */

export async function fetchNode(
  state: EmailTriageState
): Promise<Partial<EmailTriageState>> {
  console.log("fetch node running");

  const { data, error } = await supabase
    .from("google_accounts")
    .select("email, refresh_token")
    .limit(1)
    .single();

  if (error) {
    throw new Error(
      `Failed to get Google account: ${error.message}`
    );
  }

  console.log("📧 Google account:", data.email);

  // Get 20 recent unread emails from inbox
  const messages = await listMessages(
    data.refresh_token,
    20
  );

  console.log("Messages found:", messages.length);

  const emails: Email[] = [];

  for (const message of messages) {
    if (!message.id) {
      continue;
    }

    const fullMessage = await getMessage(
      data.refresh_token,
      message.id
    );

    const email = parseGmailMessage(fullMessage);

    emails.push(email);
  }

  console.log(`Parsed ${emails.length} emails`);

  return {
    emails,
  };
}


/* =========================================================
   PERSIST NODE
   ========================================================= */

export async function persistNode(
  state: EmailTriageState
): Promise<Partial<EmailTriageState>> {
  console.log("Persist node running");

  if (state.emails.length === 0) {
    console.log("No emails to persist");
    return {};
  }

  const messageIds = state.emails.map(
    (email) => email.id
  );

  // Find emails that already exist
  const {
    data: existingEmails,
    error: existingError,
  } = await supabase
    .from("emails")
    .select("message_id")
    .in("message_id", messageIds);

  if (existingError) {
    throw new Error(
      `Failed to check existing emails: ${existingError.message}`
    );
  }

  const existingMessageIds = new Set(
    existingEmails?.map(
      (email) => email.message_id
    ) ?? []
  );

  // Only persist new emails
  const newEmails = state.emails.filter(
    (email) =>
      !existingMessageIds.has(email.id)
  );

  console.log(
    `Found ${existingEmails?.length ?? 0} existing emails`
  );

  console.log(
    `New emails to persist: ${newEmails.length}`
  );

  if (newEmails.length === 0) {
    console.log("No new emails to persist");
    return {};
  }

  const rows = newEmails.map((email) => ({
    message_id: email.id,
    thread_id: email.threadId,
    account_email: email.to,
    from_email: email.from,
    to_email: email.to,
    subject: email.subject,
    body: email.body,
    received_at: email.receivedAt,
  }));

  const { data, error } = await supabase
    .from("emails")
    .insert(rows)
    .select();

  if (error) {
    throw new Error(
      `Failed to persist emails: ${error.message}`
    );
  }

  console.log(
    `Persisted ${data.length} new emails`
  );

  return {};
}


/* =========================================================
   CLASSIFY NODE
   ========================================================= */

   export async function classifyNode(
    state: EmailTriageState
  ): Promise<Partial<EmailTriageState>> {
    console.log("Classify node running");
  
    if (state.emails.length === 0) {
      console.log("No emails to classify");
  
      return {
        classification: [],
      };
    }
  
    const classifications: EmailClassification[] = [];
    let rateLimited = false;
  
    for (const email of state.emails) {
      console.log(`Classifying email: ${email.id}`);
  
      // Clean and truncate email body
      const cleanedBody = cleanEmailBody(email.body);
  
      console.log(`Original body length: ${email.body.length}`);
      console.log(`Classification body length: ${cleanedBody.length}`);
  
      const prompt = `
  You are an email classification agent.
  
  Classify the email into exactly ONE of these categories:
  
  SPAM
  LOW_PRIORITY
  INFORMATIONAL
  REQUIRES_REPLY
  MEETING
  IMPORTANT
  
  Category definitions:
  
  SPAM:
  Clearly unwanted, deceptive, suspicious, or irrelevant email.
  
  LOW_PRIORITY:
  Legitimate email that does not require attention or action.
  
  INFORMATIONAL:
  Useful information or notification that does not require a response.
  
  REQUIRES_REPLY:
  The sender explicitly expects or asks for a response.
  
  MEETING:
  The email involves a meeting, interview, appointment, scheduling,
  calendar invitation, or finding a time to meet.
  
  IMPORTANT:
  The email requires significant attention but does not fit better
  into another category.
  
  Decision rules:
  
  1. Choose exactly ONE category.
  
  2. If the email is clearly spam, suspicious, deceptive,
     or unwanted, choose SPAM.
  
  3. If the email involves scheduling, an interview,
     an appointment, a meeting, or finding a time to meet,
     choose MEETING.
  
  4. If the sender explicitly asks the recipient to respond,
     confirm something, provide information, or reply,
     and it is not primarily a meeting/scheduling email,
     choose REQUIRES_REPLY.
  
  5. If the email contains an urgent request, deadline,
     account/security issue, important work matter, or something
     that clearly requires the user's attention, choose IMPORTANT.
  
  6. Do not classify something as IMPORTANT merely because it is
     from a professional sender.
  
  7. Use INFORMATIONAL when the email provides useful information
     but does not require the user to take action.
  
  8. Use LOW_PRIORITY when the email is legitimate but provides
     little value and can safely be ignored.
  
  9. Job alerts, newsletters, promotional emails, and general
     notifications should usually be INFORMATIONAL or LOW_PRIORITY
     unless they explicitly require action.
  
  10. Do not assume every job opportunity requires a reply.
  
  11. If multiple rules appear applicable, choose the category that
      represents the most important action the user needs to take.
  
  Return ONLY valid JSON.
  
  Do NOT return a messageId.
  The application will attach the messageId itself.
  
  Return exactly this structure:
  
  {
    "category": "ONE_OF_THE_ALLOWED_CATEGORIES",
    "reason": "Short explanation of why this category was chosen.",
    "suggested_action": "What the email agent should do next."
  }
  
  Email information:
  
  From:
  ${email.from}
  
  To:
  ${email.to}
  
  Subject:
  ${email.subject}
  
  Body:
  ${cleanedBody}
  `;
  
      try {
        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You are a precise email classification system. Return only valid JSON containing category, reason, and suggested_action. Never generate or modify message IDs.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: {
            type: "json_object",
          },
        });
  
        const content = completion.choices[0]?.message?.content;
  
        if (!content) {
          throw new Error(
            `Groq returned an empty response for email ${email.id}`
          );
        }
  
        let parsed: unknown;
  
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error(
            `Groq returned invalid JSON for email ${email.id}`
          );
        }
  
        // Validate ONLY the fields generated by the LLM
        const result = LLMEmailClassificationSchema.safeParse(parsed);
  
        if (!result.success) {
          console.error("Invalid classification:", result.error.flatten());
  
          throw new Error(
            `Invalid classification returned by Groq for email ${email.id}`
          );
        }
  
        // IMPORTANT:
        // The messageId comes from our application, NOT from the LLM.
        const classification: EmailClassification = {
          messageId: email.id,
          category: result.data.category,
          reason: result.data.reason,
          suggested_action: result.data.suggested_action,
        };
  
        classifications.push(classification);
  
        console.log(
          `Classification: ${classification.category} — ${classification.reason}`
        );
  
        console.log(`Verified messageId: ${classification.messageId}`);
      } catch (error: any) {
        // Log and skip — this email simply has no entry in the
        // classifications array. Downstream nodes should treat a
        // messageId with no matching classification as "pending retry",
        // not as an error condition in itself.
        console.error(
          `Failed to classify email ${email.id}:`,
          error?.message ?? error
        );
  
        // Groq rate limits (HTTP 429) apply per-window, so every remaining
        // call in this loop would fail identically. Stop the batch here
        // instead of burning through the rest as guaranteed failures —
        // the skipped emails stay pending in Supabase and get picked up
        // on the next scheduled run once the limit resets.
        if (error?.status === 429) {
          console.warn(
            "Rate limit hit — stopping classification batch early. " +
              `${classifications.length}/${state.emails.length} emails classified this run.`
          );
          rateLimited = true;
          break;
        }
      }
  
      // Wait before processing the next email
      if (email.id !== state.emails[state.emails.length - 1]?.id) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }
  
    console.log(
      `Successfully classified ${classifications.length}/${state.emails.length} emails` +
        (rateLimited ? " (batch stopped early due to rate limit)" : "")
    );
  
    return {
      classification: classifications,
    };
  }


/* =========================================================
   ROUTE NODE
   ========================================================= */

export async function routeNode(
  state: EmailTriageState
): Promise<Partial<EmailTriageState>> {
  console.log("Route node running");

  console.log(
    "Category received by router:",
    state.classification
  );

  return {};
}

/* =========================================================
   DRAFT NODE
   ========================================================= */

   export async function draftNode(
    state: EmailTriageState
  ): Promise<Partial<EmailTriageState>> {
    console.log("Draft node running");
  
    return {};
  }
  
  
  /* =========================================================
     MEETING NODE
     ========================================================= */
  
  export async function meetingNode(
    state: EmailTriageState
  ): Promise<Partial<EmailTriageState>> {
    console.log("Meeting node running");
  
    return {};
  }