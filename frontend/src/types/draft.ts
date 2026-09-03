import type { Email } from "./email";

export type DraftStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "SENT";

export interface Draft {
  id: string;
  email_id: string;
  status: DraftStatus;
  body: string;
  created_at: string;
  updated_at: string;
  email?: Email;
}

export interface DraftListResponse {
  drafts: Draft[];
}

export interface DraftDetailResponse {
  draft: Draft & { email: Email };
}

export interface DraftMutationResponse {
  message: string;
  draft: Draft;
}

export interface ApiError {
  error: string;
  message?: string;
}