import type { gmail_v1 } from "googleapis";
import type { Email } from "../types/email";

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return (
    headers?.find(
      (header) =>
        header.name?.toLowerCase() === name.toLowerCase()
    )?.value ?? ""
  );
}

function decodeBase64Url(data: string): string {
  const normalized = data
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  return Buffer.from(normalized, "base64").toString("utf-8");
}

function extractBody(
  part: gmail_v1.Schema$MessagePart
): string {
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  if (part.parts) {
    for (const childPart of part.parts) {
      const body = extractBody(childPart);

      if (body) {
        return body;
      }
    }
  }

  return "";
}

export function parseGmailMessage(
  message: gmail_v1.Schema$Message
): Email {
  const headers = message.payload?.headers;

  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    body: message.payload
      ? extractBody(message.payload)
      : "",
      receivedAt: new Date(
        getHeader(headers, "Date").replace(/\s*\([^)]*\)\s*$/, "")
      ).toISOString(),
  };
}