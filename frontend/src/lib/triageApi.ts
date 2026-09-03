import type { TriageRunResponse } from "../types/triage";

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

export function runTriage(): Promise<TriageRunResponse> {
  return fetchJson<TriageRunResponse>(`${API_BASE}/triage/run`, { method: "POST" });
}