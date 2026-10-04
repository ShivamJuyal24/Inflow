import { supabase } from "@/lib/supabase"

/**
 * Shared fetch helper: attaches the current Supabase access token as
 * `Authorization: Bearer <token>` so backend routes protected by
 * requireAuth accept the request.
 */
export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const headers = new Headers(options?.headers)
  headers.set("Content-Type", "application/json")

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`)
  }

  return fetch(url, { ...options, headers })
}
