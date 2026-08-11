import { google } from "googleapis";
import { oauth2Client } from "../config/google";

export async function createGmailClient(refreshToken: string){
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    });

    return google.gmail({
        version:"v1",
        auth: oauth2Client
    })
}

export async function listMessages(
    refreshToken: string,
    maxResults = 10
){
    const gmail = createGmailClient(refreshToken);

    const response = (await gmail).users.messages.list({
        userId:"me",
        maxResults,
    });

    return (await response).data.messages ?? [];
}

export async function getMessage(
    refreshToken:string,
    messageId: string
){
    const gmail = createGmailClient(refreshToken)

    const response = (await gmail).users.messages.get({
        userId: "me",
        id:messageId
    });

    return (await response).data
}