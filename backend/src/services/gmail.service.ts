import { google } from "googleapis";

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
        userId: "me",
        maxResults,
        q: "in:inbox",
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

export async function sendReply(
    refreshToken: string,
    options: {
        to: string;
        from: string;
        subject: string;
        body: string;
        threadId: string;
        inReplyTo?: string;
        references?: string;
    }
){
    const gmail = await createGmailClient(refreshToken);

    const subject = /^Re:\s/i.test(options.subject)
        ? options.subject
        : `Re: ${options.subject}`;

    const headers = [
        `To: ${options.to}`,
        `From: ${options.from}`,
        `Subject: ${subject}`,
    ];

    if (options.inReplyTo) {
        headers.push(`In-Reply-To: ${options.inReplyTo}`);
    }

    if (options.references) {
        headers.push(`References: ${options.references}`);
    }

    const raw = [
        ...headers,
        `Content-Type: text/plain; charset="UTF-8"`,
        "",
        options.body,
    ].join("\r\n");

    //Base64URL encode (Gmail requirement)
    const encodedMessage = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

    const response = await gmail.users.messages.send({
        userId:"me",
        requestBody: {
            raw: encodedMessage,
            threadId: options.threadId,
        }
    });
    return response.data;
}