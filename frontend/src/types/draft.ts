import type { Email } from "./email";

export type DraftStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SENDING"
  | "SEND_UNCERTAIN"
  | "SENT";

export interface Draft {
  id: string;
  email_id: string;
  status: DraftStatus;
  body: string;
  created_at: string;
  updated_at: string;
  kind?: "reply" | "follow_up";
  sent_at?: string | null;
  followed_up_at?: string | null;
  follow_up_count?: number;
  email?: Email;
}

export interface DraftListResponse {
  drafts: Draft[];
}

export type DraftDetailResponse = Draft & { email: Email };

/** Mutation endpoints (PATCH/approve/reject/send/resolve-send) return the draft itself. */
export type DraftMutationResponse = Draft;

export interface ApiError {
  error: string;
  message?: string;
}