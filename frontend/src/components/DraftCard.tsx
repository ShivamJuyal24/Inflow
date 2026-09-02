import type { Draft } from "../types/draft";

interface DraftCardProps {
  draft: Draft;
  isSelected: boolean;
  isActionLoading: boolean;
  onSelect: (emailId: string) => void;
  onApprove: (emailId: string) => void;
  onReject: (emailId: string) => void;
}

const statusStyles: Record<string, string> = {
  PENDING_REVIEW: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  SENT: "bg-blue-100 text-blue-800",
};

export default function DraftCard({
  draft,
  isSelected,
  isActionLoading,
  onSelect,
  onApprove,
  onReject,
}: DraftCardProps) {
  const receivedDate = draft.email
    ? new Date(draft.email.received_at).toLocaleString()
    : new Date(draft.created_at).toLocaleString();

  return (
    <div
      onClick={() => onSelect(draft.email_id)}
      className={[
        "cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md",
        isSelected ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {draft.email?.subject || "No subject"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {draft.email?.from_email || "Unknown sender"} - {receivedDate}
          </p>
        </div>
        <span
          className={[
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
            statusStyles[draft.status] || "bg-gray-100 text-gray-800",
          ].join(" ")}
        >
          {draft.status}
        </span>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-700">
        {draft.body}
      </p>
      {draft.status === "PENDING_REVIEW" && (
        <div className="mt-4 flex gap-2">
          <button
            disabled={isActionLoading}
            onClick={(e) => {
              e.stopPropagation();
              onApprove(draft.email_id);
            }}
            className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={isActionLoading}
            onClick={(e) => {
              e.stopPropagation();
              onReject(draft.email_id);
            }}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}