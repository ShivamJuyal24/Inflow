import type { Draft, DraftListResponse, DraftDetailResponse, DraftMutationResponse } from "../types/draft";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.message || errBody.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listDrafts(): Promise<DraftListResponse> {
  return fetchJson<DraftListResponse>(`${API_BASE}/drafts`);
}

export function fetchDraft(emailId: string): Promise<DraftDetailResponse> {
  return fetchJson<DraftDetailResponse>(`${API_BASE}/drafts/${emailId}`);
}

export async function approveDraft(emailId: string): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}/approve`, { method: "POST" });
  return res.draft;
}

export async function rejectDraft(emailId: string): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}/reject`, { method: "POST" });
  return res.draft;
}

export async function sendDraft(emailId: string): Promise<Draft> {
  const res = await fetchJson<DraftMutationResponse>(`${API_BASE}/drafts/${emailId}/send`, { method: "POST" });
  return res.draft;
}