import { log } from "node:console";
import { supabase } from "../config/supabase";
import { listMessages } from "./gmail.service";

async function main(){
    const {data, error} = await supabase
    .from("google_accounts")
    .select("email, refresh_token")
    .limit(1)
    .single();

    if(error){
        throw new Error(`Failed to get google account: ${error.message}`)
    }
    console.log("Google account:", data.email);

    const messages = await listMessages(data.refresh_token, 5);

    console.log("messages found:", messages.length);
    console.log(messages);
}

main().catch((error)=>{
    console.error("Gmail test failed:");
    console.error(error);
})