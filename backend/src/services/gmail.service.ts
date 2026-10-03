import { google } from "googleapis";
import type { gmail_v1 } from "googleapis";

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

/**
 * A single page of message metadata from the Gmail API.
 * `messages` contains id/threadId stubs only — full payloads
 * require a separate `getMessage` call per message.
 */
export type ListMessagePage = {
    messages: gmail_v1.Schema$Message[];
    nextPageToken?: string;
};

export type ListMessagePageOptions = {
    /** Page size for this single request (Gmail caps at 500). */
    maxResults?: number;
    /** Token from the previous page's nextPageToken, if any. */
    pageToken?: string;
    /** Gmail search query. Defaults to the inbox. */
    query?: string;
};

/**
 * Fetch a single page of message metadata.
 *
 * Defensive against malformed responses: a missing `messages` array
 * yields an empty page, and a missing/absent `nextPageToken` simply
 * means "no further pages".
 */
export async function listMessagePage(
    refreshToken: string,
    options: ListMessagePageOptions = {}
): Promise<ListMessagePage> {
    const gmail = await createGmailClient(refreshToken);

    const response = await gmail.users.messages.list({
        userId: "me",
        maxResults: options.maxResults ?? 100,
        pageToken: options.pageToken,
        q: options.query ?? "in:inbox",
    });

    const data = response.data ?? {};
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const nextPageToken =
        typeof data.nextPageToken === "string" && data.nextPageToken
            ? data.nextPageToken
            : undefined;

    return { messages, nextPageToken };
}

export type ListAllMessagesOptions = {
    /** Messages fetched per Gmail API request. Capped at 500 by Gmail. */
    pageSize?: number;
    /** Overall ceiling for a single run; pagination stops once reached. */
    maxMessages?: number;
    query?: string;
};

/**
 * Fetch message metadata across all available pages, following
 * Gmail's `nextPageToken` cursor.
 *
 * - Stops when the API reports no further page or when `maxMessages`
 *   have been collected (the final request uses a reduced page size so
 *   we don't grossly over-fetch).
 * - An empty page terminates pagination — Gmail normally only returns
 *   one, but a malformed response without a token would otherwise loop.
 * - API errors propagate to the caller with page context attached.
 */
export async function listAllMessages(
    refreshToken: string,
    options: ListAllMessagesOptions = {}
): Promise<gmail_v1.Schema$Message[]> {
    const pageSize = Math.min(options.pageSize ?? 100, 500);
    const maxMessages = options.maxMessages ?? Number.POSITIVE_INFINITY;

    const collected: gmail_v1.Schema$Message[] = [];
    const seenIds = new Set<string>();
    let pageToken: string | undefined;

    for (let page = 0; ; page++) {
        const remaining = maxMessages - collected.length;
        if (remaining <= 0) break;

        let result: ListMessagePage;
        try {
            result = await listMessagePage(refreshToken, {
                maxResults: Math.min(pageSize, remaining),
                pageToken,
                query: options.query,
            });
        } catch (error: any) {
            throw new Error(
                `Gmail list failed on page ${page}: ${error?.message ?? error}`
            );
        }

        // Defensively skip entries without an id and repeated ids (Gmail
        // should not return either, but a malformed or overlapping page
        // must not corrupt the run's message set or the limit math).
        for (const message of result.messages) {
            if (message.id && !seenIds.has(message.id)) {
                seenIds.add(message.id);
                collected.push(message);
            }
        }

        if (!result.nextPageToken || result.messages.length === 0) {
            break;
        }

        pageToken = result.nextPageToken;
    }

    return collected;
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