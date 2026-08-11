import { supabase } from "../config/supabase";
import { getMessage, listMessages } from "./gmail.service";
import { parseGmailMessage } from "./email.parser";

async function main() {
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

  console.log("Google account:", data.email);

  const messages = await listMessages(
    data.refresh_token,
    5
  );

  console.log("Messages found:", messages.length);

  if (messages.length === 0) {
    console.log("No messages found.");
    return;
  }

  const message = await getMessage(
    data.refresh_token,
    messages[0].id!
  );

  const email = parseGmailMessage(message);

  console.dir(email, { depth: null });
}

main().catch((error) => {
  console.error("Gmail test failed:");
  console.error(error);
});