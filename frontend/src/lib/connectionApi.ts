import { apiFetch } from "./apiClient"

const API_BASE = import.meta.env.VITE_API_URL || "/api"

export interface GmailConnectionStatus {
  connected: boolean
  email: string | null
}

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  const res = await apiFetch(`${API_BASE}/auth/google/status`)
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.message || `HTTP ${res.status}`)
  }
  return res.json() as Promise<GmailConnectionStatus>
}
