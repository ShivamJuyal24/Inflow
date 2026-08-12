import { EmailTriageState } from "./state";
import { getMessage, listMessages } from "../services/gmail.service";
import { parseGmailMessage } from "../services/email.parser";

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
          const emails = [];

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
