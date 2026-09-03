import type { EmailListResponse, EmailDetailResponse, EmailCategory } from "../types/email";

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

interface ListEmailsParams {
  page?: number;
  limit?: number;
  category?: EmailCategory;
  query?: string;
}

export function listEmails(params: ListEmailsParams = {}): Promise<EmailListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.category) searchParams.set("category", params.category);
  if (params.query) searchParams.set("q", params.query);

  const qs = searchParams.toString();
  return fetchJson<EmailListResponse>(`${API_BASE}/emails${qs ? `?${qs}` : ""}`);
}

export function getEmail(id: string): Promise<EmailDetailResponse> {
  return fetchJson<EmailDetailResponse>(`${API_BASE}/emails/${id}`);
}