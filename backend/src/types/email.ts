export type Email = {
    id: string;
    threadId: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    receivedAt: string;
    /** Gmail label IDs, e.g. INBOX, CATEGORY_PROMOTIONS. */
    labels?: string[];
    /** Headers used for deterministic classification */
    listUnsubscribe?: string;
    precedence?: string;
    autoSubmitted?: string;
};