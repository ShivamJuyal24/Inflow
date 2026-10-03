export type DraftStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  /** Claimed by exactly one send request; Gmail call in flight. */
  | "SENDING"
  /** Gmail did not confirm the send. Needs human reconciliation, never an automatic resend. */
  | "SEND_UNCERTAIN"
  | "SENT";

export type EmailDraft = {
  messageId: string;
  draftBody: string;
  status: DraftStatus;
};
