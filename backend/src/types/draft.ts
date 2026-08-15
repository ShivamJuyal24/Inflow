export type DraftStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SENT";

export type EmailDraft = {
  messageId: string;
  draftBody: string;
  status: DraftStatus;
};