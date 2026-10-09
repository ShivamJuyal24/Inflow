import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import AppShell from "@/components/layout/AppShell"
import type { NavCategory } from "@/components/layout/NavRail"
import InboxList from "@/components/InboxList"
import EmailDetail from "@/components/EmailDetail"
import DraftDetail from "@/components/DraftDetail"
import TriageRunButton from "@/components/TriageRunButton"
import { supabase } from "@/lib/supabase"
import { listEmails, getEmail } from "@/lib/emailApi"
import { getGmailConnectionStatus } from "@/lib/connectionApi"
import {
  fetchDraft,
  updateDraft,
  approveDraft,
  rejectDraft,
  sendDraft,
  resolveSend,
  DraftApiError,
} from "@/lib/draftApi"
import type { InboxEmail, Email, EmailFilter } from "@/types/email"
import type { Draft } from "@/types/draft"

const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function startGmailConnect(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("You are signed out. Please log in again.")

  const res = await fetch(`${API_BASE}/auth/google`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error("Could not start the Gmail connection.")

  const body = (await res.json()) as { url?: string; authUrl?: string }
  const target = body.url ?? body.authUrl
  if (!target) throw new Error("The server did not return a Google sign-in URL.")
  window.location.href = target
}

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [activeCategory, setActiveCategory] = useState<NavCategory>("ACTIONABLE");
  const [emails, setEmails] = useState<InboxEmail[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [draftAction, setDraftAction] = useState<string | null>(null)

  const [connecting, setConnecting] = useState(false)
  const [justConnected, setJustConnected] = useState(false)
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null)

  // Load the list whenever category/page/query changes
  const loadEmails = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const singleCategory =
        activeCategory !== "ALL"
          ? (activeCategory as EmailFilter)
          : undefined
      const data = await listEmails({ page, limit: 20, category: singleCategory, query })

      setEmails(data.emails)
      setTotalPages(data.pagination.totalPages)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load emails")
    } finally {
      setLoading(false)
    }
  }, [activeCategory, page, query])

  useEffect(() => {
    loadEmails()
  }, [loadEmails])

  // Returning from the Gmail OAuth callback: /dashboard?gmail=connected
  useEffect(() => {
    if (searchParams.get("gmail") === "connected") {
      setJustConnected(true)
      setGmailConnected(true)
      const next = new URLSearchParams(searchParams)
      next.delete("gmail")
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Determine whether a Gmail account is actually connected for this user
  useEffect(() => {
    let cancelled = false
    getGmailConnectionStatus()
      .then((status) => {
        if (!cancelled) setGmailConnected(status.connected)
      })
      .catch(() => {
        if (!cancelled) {
          setGmailConnected(null)
          setError("Could not check Gmail connection status. Please refresh the page.")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Reset to page 1 when switching category or searching
  const handleCategoryChange = (cat: NavCategory) => {
    setActiveCategory(cat)
    setPage(1)
    setSelectedEmailId(null)
  }

  // Load detail (email + draft, if one exists) when an email is selected
  useEffect(() => {
    if (!selectedEmailId) {
      setSelectedEmail(null)
      setSelectedDraft(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setSelectedEmail(null)
    setSelectedDraft(null)

    Promise.all([
      getEmail(selectedEmailId),
      fetchDraft(selectedEmailId).catch(() => null), // not every email has a draft
    ])
      .then(([emailRes, draftRes]) => {
        if (cancelled) return
        setSelectedEmail(emailRes.email)
        setSelectedDraft(draftRes ?? null)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load email")
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedEmailId])

  const handleDraftAction = async (
    action: "approve" | "reject" | "send",
    emailId: string
  ) => {
    const fn = action === "approve" ? approveDraft : action === "reject" ? rejectDraft : sendDraft
    try {
      setDraftAction(action)
      const updated = await fn(emailId)
      setSelectedDraft(updated)
    } catch (err) {
      if (err instanceof DraftApiError && err.draft) {
        setSelectedDraft(err.draft)
      }
      setError(err instanceof Error ? err.message : `${action} failed`)
    } finally {
      setDraftAction(null)
    }
  }

  const handleDraftSave = async (emailId: string, body: string) => {
    try {
      setDraftAction("save")
      const updated = await updateDraft(emailId, body)
      setSelectedDraft(updated)
    } finally {
      setDraftAction(null)
    }
  }

  const handleResolveSend = async (
    emailId: string,
    outcome: "SENT" | "NOT_SENT"
  ) => {
    const action = outcome === "SENT" ? "resolve-sent" : "resolve-unsent"
    try {
      setDraftAction(action)
      const updated = await resolveSend(emailId, outcome)
      setSelectedDraft(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve send")
    } finally {
      setDraftAction(null)
    }
  }

  const handleConnectGmail = async () => {
    try {
      setConnecting(true)
      setError(null)
      await startGmailConnect()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Gmail")
      setConnecting(false)
    }
  }

  // Show the connect prompt only when the backend reports no connected account.
  const showConnectCard = !selectedEmailId && gmailConnected === false

  return (
    <AppShell
      activeCategory={activeCategory}
      onCategoryChange={handleCategoryChange}
      headerActions={
        <>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search sender or subject..."
              aria-label="Search emails"
              className="h-9 w-64 rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          {gmailConnected === true && <TriageRunButton onComplete={loadEmails} />}
        </>
      }
    >
      {justConnected && (
        <div
          role="status"
          className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 dark:text-emerald-400"
        >
          <span>Gmail connected. Run triage to classify your inbox and generate drafts.</span>
          <button
            onClick={() => setJustConnected(false)}
            className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {showConnectCard && (
        <div className="mx-4 mt-4 flex flex-col items-start gap-4 rounded-2xl border border-indigo-500/25 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-transparent p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-base font-semibold tracking-tight">Connect your Gmail</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Inflow needs access to your inbox to classify emails and draft replies. Nothing is
              sent until you approve it.
            </p>
          </div>
          <button
            onClick={handleConnectGmail}
            disabled={connecting}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {connecting ? "Redirecting to Google..." : "Connect Gmail"}
          </button>
        </div>
      )}

      {selectedEmailId ? (
        <div className="flex h-full flex-col">
          <button
            onClick={() => setSelectedEmailId(null)}
            className="m-4 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden="true">←</span> Back to inbox
          </button>

          {detailLoading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Loading...
            </div>
          ) : selectedEmail ? (
            selectedDraft ? (
              <DraftDetail
                draft={selectedDraft}
                email={selectedEmail}
                onApprove={(id) => handleDraftAction("approve", id)}
                onReject={(id) => handleDraftAction("reject", id)}
                onSend={(id) => handleDraftAction("send", id)}
                onSave={handleDraftSave}
                onResolveSend={handleResolveSend}
                loadingAction={draftAction}
              />
            ) : (
              <EmailDetail email={selectedEmail} />
            )
          ) : null}
        </div>
      ) : (
        <InboxList
          emails={emails}
          loading={loading}
          error={null}
          selectedId={selectedEmailId}
          onSelect={setSelectedEmailId}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </AppShell>
  )
}