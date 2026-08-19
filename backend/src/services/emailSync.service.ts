import { supabase } from "../config/supabase.js";
import { listMessages, getMessage } from "./gmail.service.js";
import { parseGmailMessage } from "./email.parser.js";

let syncInProgress = false;

export async function syncRecentEmails(maxResults = 20) {
  // Prevent overlapping syncs (auto-sync timer + manual trigger at the same time)
  if (syncInProgress) {
    console.log("Email sync already in progress — skipping");
    return { fetched: 0, inserted: 0, skipped: true };
  }

  syncInProgress = true;

  try {
    // 1. Get Google account + refresh token
    const { data: account, error: accountError } = await supabase
      .from("google_accounts")
      .select("email, refresh_token")
      .limit(1)
      .single();

    if (accountError || !account) {
      throw new Error(`Failed to get Google account: ${accountError?.message}`);
    }

    // 2. Fetch recent inbox messages from Gmail
    const messages = await listMessages(account.refresh_token, maxResults);
    console.log(`Sync: ${messages.length} messages found in Gmail`);

    if (messages.length === 0) {
      return { fetched: 0, inserted: 0, skipped: false };
    }

    // 3. Find which ones are already in Supabase
    const messageIds = messages
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id));

    const { data: existingEmails, error: existingError } = await supabase
      .from("emails")
      .select("message_id")
      .in("message_id", messageIds);

    if (existingError) {
      throw new Error(`Failed to check existing emails: ${existingError.message}`);
    }

    const existingIds = new Set(existingEmails?.map((e) => e.message_id) ?? []);
    const newMessageIds = messageIds.filter((id) => !existingIds.has(id));

    console.log(`Sync: ${newMessageIds.length} new emails to persist`);

    if (newMessageIds.length === 0) {
      return { fetched: messages.length, inserted: 0, skipped: false };
    }

    // 4. Fetch full message only for NEW emails (saves Gmail API calls)
    const rows = [];
    for (const id of newMessageIds) {
      const fullMessage = await getMessage(account.refresh_token, id);
      const email = parseGmailMessage(fullMessage);

      rows.push({
        message_id: email.id,
        thread_id: email.threadId,
        account_email: email.to,
        from_email: email.from,
        to_email: email.to,
        subject: email.subject,
        body: email.body,
        received_at: email.receivedAt,
      });
    }

    // 5. Insert new emails
    const { data, error } = await supabase.from("emails").insert(rows).select();

    if (error) {
      throw new Error(`Failed to persist emails: ${error.message}`);
    }

    console.log(`Sync: persisted ${data.length} new emails`);
    return { fetched: messages.length, inserted: data.length, skipped: false };
  } finally {
    syncInProgress = false;
  }
}