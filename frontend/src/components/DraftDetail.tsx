import { useEffect, useState } from "react"
import type { Draft } from "../types/draft"
import type { Email } from "../types/email"

// Colour mapping for draft status
const STATUS_STYLES: Record<Draft["status"], { badge: string; border: string }> = {
  PENDING_REVIEW: {
    badge: "bg-amber-100 text-amber-700",
    border: "border-amber-300",
  },
  APPROVED: {
    badge: "bg-green-100 text-green-700",
    border: "border-green-300",
  },
  REJECTED: {
    badge: "bg-red-100 text-red-700",
    border: "border-red-300",
  },
  SENDING: {
    badge: "bg-purple-100 text-purple-700",
    border: "border-purple-300",
  },
  SEND_UNCERTAIN: {
    badge: "bg-orange-100 text-orange-700",
    border: "border-orange-300",
  },
  SENT: {
    badge: "bg-blue-100 text-blue-700",
    border: "border-blue-300",
  },
}

interface DraftDetailProps {
  draft: Draft
  email: Email
  onApprove: (emailId: string) => void
  onReject: (emailId: string) => void
  onSend: (emailId: string) => void
  /**
   * Persist edited reply text. Should resolve once the saved draft has been
   * put back into the parent's state (so `draft.body` reflects the save) and
   * reject on failure. When omitted, the reply is read-only.
   */
  onSave?: (emailId: string, body: string) => Promise<void> | void
  /** Reconcile a draft whose send Gmail did not confirm. */
  onResolveSend?: (emailId: string, outcome: "SENT" | "NOT_SENT") => void
  loadingAction: string | null
}

export default function DraftDetail({
  draft,
  email,
  onApprove,
  onReject,
  onSend,
  onSave,
  onResolveSend,
  loadingAction,
}: DraftDetailProps) {
  const isPending = draft.status === "PENDING_REVIEW"
  const isApproved = draft.status === "APPROVED"
  const isSending = draft.status === "SENDING"
  const isUncertain = draft.status === "SEND_UNCERTAIN"
  const statusStyle = STATUS_STYLES[draft.status] ?? STATUS_STYLES.PENDING_REVIEW

  const canEdit = isPending && onSave !== undefined
  const [text, setText] = useState(draft.body)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Start from the saved text whenever a different draft is shown or the
  // saved text changes (after a successful save, or a refetch).
  useEffect(() => {
    setText(draft.body)
    setSaveError(null)
  }, [draft.email_id, draft.body])

  const isDirty = canEdit && text !== draft.body
  const isBusy = loadingAction !== null
  const canSave = isDirty && text.trim().length > 0 && !isBusy

  async function handleSave() {
    if (!onSave || !canSave) return
    setSaveError(null)
    try {
      await onSave(draft.email_id, text)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save your changes")
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      {/* Email header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">{email.subject}</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.badge}`}
          >
            {draft.status.replace(/_/g, " ")}
          </span>
        </div>
        <div className="mt-1 text-sm text-gray-600">
          <span className="font-medium">From:</span> {email.from_email}
        </div>
        <div className="text-sm text-gray-500">
          <span className="font-medium">Received:</span>{" "}
          {new Date(email.received_at).toLocaleString()}
        </div>
      </div>

      {/* Original email */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Original Email
        </h3>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
          {email.body}
        </div>
      </section>

      {/* Proposed reply – editable while pending review */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Proposed Reply
        </h3>
        {draft.kind === "follow_up" && (
          <p className="mb-3 rounded-md bg-purple-50 px-3 py-2 text-xs font-medium text-purple-800">
            Follow-up draft — our original reply was sent, but no response
            arrived within 3 days.
          </p>
        )}
        {canEdit ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isBusy}
              rows={10}
              aria-label="Edit proposed reply"
              className={`w-full resize-y rounded-lg border-2 bg-blue-50 p-4 text-sm leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-60 ${statusStyle.border}`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                disabled={!canSave}
                onClick={handleSave}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-900 disabled:opacity-50"
              >
                {loadingAction === "save" ? "Saving..." : "Save changes"}
              </button>
              {isDirty && (
                <button
                  disabled={isBusy}
                  onClick={() => {
                    setText(draft.body)
                    setSaveError(null)
                  }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  Discard
                </button>
              )}
              {isDirty && (
                <span className="text-sm text-amber-700">
                  Unsaved changes. Save before approving.
                </span>
              )}
              {saveError && (
                <span role="alert" className="text-sm text-red-600">
                  {saveError}
                </span>
              )}
            </div>
          </>
        ) : (
          <div
            className={`rounded-lg border-2 p-4 text-sm leading-relaxed whitespace-pre-wrap text-gray-800 bg-blue-50 ${statusStyle.border}`}
          >
            {draft.body}
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="mt-auto flex flex-wrap gap-3 pt-2">
        {isPending && (
          <>
            <button
              disabled={isBusy || isDirty}
              title={isDirty ? "Save your changes before approving" : undefined}
              onClick={() => onApprove(draft.email_id)}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              {loadingAction === "approve" ? "Approving..." : "Approve Reply"}
            </button>
            <button
              disabled={isBusy}
              onClick={() => onReject(draft.email_id)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {loadingAction === "reject" ? "Rejecting..." : "Reject Reply"}
            </button>
          </>
        )}
        {isApproved && (
          <button
            disabled={isBusy}
            onClick={() => onSend(draft.email_id)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {loadingAction === "send" ? "Sending..." : "Send Email"}
          </button>
        )}
        {isSending && (
          <span className="text-sm text-gray-500 italic">
            This reply is being sent. Refresh in a moment to see the result.
          </span>
        )}
        {isUncertain && (
          <div className="w-full rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">
            <p className="font-medium">Gmail did not confirm whether this reply was sent.</p>
            <p className="mt-1">
              Check your Sent folder before doing anything else, so the recipient
              doesn't get the reply twice.
            </p>
            {onResolveSend && (
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  disabled={isBusy}
                  onClick={() => onResolveSend(draft.email_id, "SENT")}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {loadingAction === "resolve-sent" ? "Saving..." : "It was sent"}
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => onResolveSend(draft.email_id, "NOT_SENT")}
                  className="rounded-md border border-orange-400 px-3 py-1.5 text-sm font-medium text-orange-900 transition-colors hover:bg-orange-100 disabled:opacity-60"
                >
                  {loadingAction === "resolve-unsent" ? "Saving..." : "It wasn't sent - allow resend"}
                </button>
              </div>
            )}
          </div>
        )}
        {!isPending && !isApproved && !isSending && !isUncertain && (
          <span className="text-sm text-gray-500 italic">
            This draft is {draft.status.toLowerCase()}.
          </span>
        )}
      </div>
    </div>
  )
}
