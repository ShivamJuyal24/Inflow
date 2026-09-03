import { useCallback, useEffect, useState } from "react"
import AppShell from "@/components/layout/AppShell"
import type { NavCategory } from "@/components/layout/NavRail"
import InboxList from "@/components/InboxList"
import EmailDetail from "@/components/EmailDetail"
import DraftDetail from "@/components/DraftDetail"
import TriageRunButton from "@/components/TriageRunButton"
import { listEmails, getEmail } from "@/lib/emailApi"
import { fetchDraft, approveDraft, rejectDraft, sendDraft } from "@/lib/draftApi"
import type { InboxEmail, Email, EmailCategory } from "@/types/email"
import type { Draft } from "@/types/draft"



export default function Dashboard() {
  const [activeCategory, setActiveCategory] = useState<NavCategory>("ALL")
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

  // Load the list whenever category/page/query changes
  const loadEmails = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const singleCategory =
      activeCategory !== "ALL"
        ? (activeCategory as EmailCategory)
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
        setSelectedDraft(draftRes?.draft ?? null)
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
      setError(err instanceof Error ? err.message : `${action} failed`)
    } finally {
      setDraftAction(null)
    }
  }

  return (
    <AppShell
      activeCategory={activeCategory}
      onCategoryChange={handleCategoryChange}
      headerActions={
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sender or subject..."
            className="h-8 w-64 rounded-md border border-input bg-background px-3 text-sm"
          />
          <TriageRunButton onComplete={loadEmails} />
        </>
      }
    >
      {error && (
        <div className="mx-4 mt-4 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {selectedEmailId ? (
        <div className="flex h-full flex-col">
          <button
            onClick={() => setSelectedEmailId(null)}
            className="m-4 w-fit text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← Back to inbox
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