import { EmailTriageState } from "./state";
import { getMessage, listMessages } from "../services/gmail.service";
import { parseGmailMessage } from "../services/email.parser";
import type { Email } from "../types/email";
import { supabase } from "../config/supabase";
export async function fetchNode(
    state: EmailTriageState
): Promise<Partial<EmailTriageState>>{
    console.log("fetch node running");

    const {data, error}= await supabase
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

          // get recent Gmail messages
          const messages = await listMessages(data.refresh_token, 5);

          console.log(" Messages found:", messages.length);

          // Fetch and parse every message
          const emails: Email[] = [];

          for(const message of messages){
            if(!message.id){
                continue;
            }

            const fullMessage = await getMessage(data.refresh_token, message.id);

            const email = parseGmailMessage(fullMessage);

            emails.push(email);
          }

          console.log(`Parsed ${emails.length} emails`);

          return {
            emails,
          }
          
}

export async function persistNode(
  state: EmailTriageState
): Promise<Partial<EmailTriageState>> {
  console.log("Persist node running");

  if (state.emails.length === 0) {
    console.log("No emails to persist");
    return {};
  }

  const messageIds = state.emails.map((email) => email.id);

  // Find emails that already exist
  const { data: existingEmails, error: existingError } = await supabase
    .from("emails")
    .select("message_id")
    .in("message_id", messageIds);

  if (existingError) {
    throw new Error(
      `Failed to check existing emails: ${existingError.message}`
    );
  }

  const existingMessageIds = new Set(
    existingEmails?.map((email) => email.message_id) ?? []
  );

  // Keep only emails that are not already stored
  const newEmails = state.emails.filter(
    (email) => !existingMessageIds.has(email.id)
  );

  console.log(`Found ${existingEmails?.length ?? 0} existing emails`);
  console.log(`New emails to persist: ${newEmails.length}`);

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

  console.log(`Persisted ${data.length} new emails`);

  return {};
}

export async function classifyNode(
    state: EmailTriageState
): Promise<Partial<EmailTriageState>>{
    console.log("Classify node running");
    console.log("Email received by classifier:", state.emails);
    return {
        category: "test"
    };
}

export async function routeNode(
    state: EmailTriageState
): Promise<Partial<EmailTriageState>>{
    console.log("Route node running");
    console.log("Category received by router:", state.category);
    return {};
}
