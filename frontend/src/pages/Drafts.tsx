import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import DraftCard from "@/components/DraftCard"
import DraftDetail from "@/components/DraftDetail"
import {
  listDrafts,
  fetchDraft,
  updateDraft,
  approveDraft,
  rejectDraft,
  sendDraft,
  resolveSend,
  DraftApiError,
} from "@/lib/draftApi"
import type { Draft } from "@/types/draft"
import type { Email } from "@/types/email"

export default function Drafts() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listDrafts()
      .then((data) => setDrafts(data.drafts))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load drafts"))
      .finally(() => setLoading(false))
  }, [])

  // Load the full draft (with email) when one is selected
  useEffect(() => {
    if (!selectedId) {
      setSelectedDraft(null)
      setSelectedEmail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    fetchDraft(selectedId)
      .then((res) => {
        if (cancelled) return
        setSelectedDraft(res)
        setSelectedEmail(res.email)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load draft")
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const handleDraftAction = async (action: "approve" | "reject" | "send", emailId: string) => {
    const fn = action === "approve" ? approveDraft : action === "reject" ? rejectDraft : sendDraft
    try {
      setActionLoading(action)
      setError(null)
      const updated = await fn(emailId)
      setDrafts((prev) => prev.map((d) => (d.email_id === emailId ? updated : d)))
      setSelectedDraft(updated)
    } catch (err) {
      if (err instanceof DraftApiError && err.draft) {
        setSelectedDraft(err.draft)
      }
      setError(err instanceof Error ? err.message : `${action} failed`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDraftSave = async (emailId: string, body: string) => {
    try {
      setActionLoading("save")
      const updated = await updateDraft(emailId, body)
      setDrafts((prev) => prev.map((d) => (d.email_id === emailId ? updated : d)))
      setSelectedDraft(updated)
    } finally {
      setActionLoading(null)
    }
  }

  const handleResolveSend = async (emailId: string, outcome: "SENT" | "NOT_SENT") => {
    try {
      setActionLoading(outcome === "SENT" ? "resolve-sent" : "resolve-unsent")
      const updated = await resolveSend(emailId, outcome)
      setDrafts((prev) => prev.map((d) => (d.email_id === emailId ? updated : d)))
      setSelectedDraft(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve send")
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-8">
      <div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <span aria-hidden="true">←</span> Back to inbox
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Drafts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Replies drafted by Inflow. Nothing is sent until you approve it.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {selectedId ? (
        <div className="flex flex-col">
          <button
            onClick={() => setSelectedId(null)}
            className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden="true">←</span> Back to drafts
          </button>
          {detailLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              Loading...
            </div>
          ) : selectedDraft && selectedEmail ? (
            <DraftDetail
              draft={selectedDraft}
              email={selectedEmail}
              onApprove={(id) => handleDraftAction("approve", id)}
              onReject={(id) => handleDraftAction("reject", id)}
              onSend={(id) => handleDraftAction("send", id)}
              onSave={handleDraftSave}
              onResolveSend={handleResolveSend}
              loadingAction={actionLoading}
            />
          ) : null}
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading drafts">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border bg-muted/50" />
          ))}
        </div>
      ) : drafts.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
          <h2 className="text-base font-semibold">No drafts yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Run triage from your inbox. Inflow will draft replies for the emails that need one.
          </p>
          <Link
            to="/dashboard"
            className="mt-1 inline-flex items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
          >
            Go to inbox
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              isSelected={selectedId === draft.email_id}
              isActionLoading={actionLoading !== null}
              onSelect={setSelectedId}
              onApprove={(emailId) => handleDraftAction("approve", emailId)}
              onReject={(emailId) => handleDraftAction("reject", emailId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}