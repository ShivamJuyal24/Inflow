import type { Draft, Email } from "../types/draft";

interface DraftDetailProps {
  draft: Draft;
  email: Email;
  onApprove: (emailId: string) => void;
  onReject: (emailId: string) => void;
  onSend: (emailId: string) => void;
  loadingAction: string | null;
}

export default function DraftDetail({
  draft,
  email,
  onApprove,
  onReject,
  onSend,
  loadingAction,
}: DraftDetailProps) {
  const isPending = draft.status === "PENDING_REVIEW";
  const isApproved = draft.status === "APPROVED";

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      {/* Email header */}
      <div className="border-b border-gray-200 pb-4">
        <h2 className="text-lg font-semibold text-gray-900">{email.subject}</h2>
        <div className="mt-1 text-sm text-gray-600">
          <span className="font-medium">From:</span>{" "}
          {email.from_email}
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

      {/* Proposed reply */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Proposed Reply
        </h3>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed whitespace-pre-wrap text-gray-800">
          {draft.body}
        </div>
      </section>

      {/* Actions */}
      <div className="mt-auto flex flex-wrap gap-3 pt-2">
        {isPending && (
          <>
            <button
              disabled={loadingAction === "approve"}
              onClick={() => onApprove(draft.email_id)}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-60"
            >
              {loadingAction === "approve" ? "Approving..." : "Approve Reply"}
            </button>
            <button
              disabled={loadingAction === "reject"}
              onClick={() => onReject(draft.email_id)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {loadingAction === "reject" ? "Rejecting..." : "Reject Reply"}
            </button>
          </>
        )}
        {isApproved && (
          <button
            disabled={loadingAction === "send"}
            onClick={() => onSend(draft.email_id)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {loadingAction === "send" ? "Sending..." : "Send Email"}
          </button>
        )}
        {!isPending && !isApproved && (
          <span className="text-sm text-gray-500 italic">
            This draft is {draft.status}.
          </span>
        )}
      </div>
    </div>
  );
}