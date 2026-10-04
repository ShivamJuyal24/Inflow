import type { Draft, DraftListResponse, DraftDetailResponse, DraftMutationResponse } from "../types/draft";
import { apiFetch } from "./apiClient";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export class DraftApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly draft?: Draft
  ) {
    super(message);
    this.name = "DraftApiError";
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new DraftApiError(
      errBody.message || errBody.error || `HTTP ${res.status}`,
      res.status,
      errBody.draft
    );
  }
  return res.json() as Promise<T>;
}

export function listDrafts(): Promise<DraftListResponse> {
  return fetchJson<DraftListResponse>(`${API_BASE}/drafts`);
}

export function fetchDraft(emailId: string): Promise<DraftDetailResponse> {
  return fetchJson<DraftDetailResponse>(`${API_BASE}/drafts/${emailId}`);
}

/** Saves edited reply text. Only works while the draft is PENDING_REVIEW. */
export async function updateDraft(emailId: string, body: string): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  return res;
}

export async function approveDraft(emailId: string): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}/approve`, { method: "POST" });
  return res;
}

export async function rejectDraft(emailId: string): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}/reject`, { method: "POST" });
  return res;
}

export async function sendDraft(emailId: string): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}/send`, { method: "POST" });
  return res;
}

export type SendOutcome = "SENT" | "NOT_SENT";

/**
 * After an uncertain send, report what actually happened (checked in the
 * Sent folder). SENT marks the draft sent; NOT_SENT lets it be sent again.
 */
export async function resolveSend(emailId: string, outcome: SendOutcome): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}/resolve-send`, {
    method: "POST",
    body: JSON.stringify({ outcome }),
  });
  return res;
}
