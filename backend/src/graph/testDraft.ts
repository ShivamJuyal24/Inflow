import { draftNode } from "./nodes";
import { supabase } from "../config/supabase";
import type { Email } from "../types/email";
import type { EmailTriageState } from "./state";

async function main() {
  console.log("=== Draft Node Test ===");

  // Get one real persisted email
  const { data: emailRow, error } = await supabase
    .from("emails")
    .select(
      "id, message_id, thread_id, from_email, to_email, subject, body, received_at"
    )
    .limit(1)
    .single();

  if (error || !emailRow) {
    throw new Error(
      `Failed to load test email: ${error?.message ?? "No email found"}`
    );
  }

  const email: Email = {
    id: emailRow.message_id,
    threadId: emailRow.thread_id,
    from: emailRow.from_email,
    to: emailRow.to_email,
    subject: emailRow.subject,
    body: emailRow.body,
    receivedAt: emailRow.received_at,
  };

  console.log("\nTest email:");
  console.log("Message ID:", email.id);
  console.log("From:", email.from);
  console.log("Subject:", email.subject);

  const state: EmailTriageState = {
    emails: [email],

    classification: [
      {
        messageId: email.id,
        category: "REQUIRES_REPLY",
        reason: "Controlled test for reply drafting.",
        suggested_action: "Draft a reply.",
      },
    ],

    actions: [
      {
        messageId: email.id,
        type: "DRAFT_REPLY",
        status: "PENDING",
      },
    ],

    drafts: [],
    calendarSlots: [],
    approvalStatus: null,
  };

  console.log("\nRunning draftNode...\n");

  const result = await draftNode(state);

  console.log("\n=== Result ===");

  console.log("\nDrafts:");
  console.dir(result.drafts, { depth: null });

  console.log("\nActions:");
  console.dir(result.actions, { depth: null });
}

main().catch((error) => {
  console.error("\nDraft test failed:");
  console.error(error);
});