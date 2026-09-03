import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { InboxEmail, EmailCategory } from "@/types/email"

// --- Shared styles (exported for reuse in EmailDetail) ---
export const CATEGORY_BADGE_STYLES: Record<EmailCategory, string> = {
  IMPORTANT: "bg-red-100 text-red-700 hover:bg-red-100",
  REQUIRES_REPLY: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  MEETING: "bg-violet-100 text-violet-700 hover:bg-violet-100",
  INFORMATIONAL: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  LOW_PRIORITY: "bg-slate-100 text-slate-500 hover:bg-slate-100",
  SPAM: "bg-rose-100 text-rose-700 hover:bg-rose-100",
}

export const CATEGORY_BORDER_COLORS: Record<EmailCategory, string> = {
  IMPORTANT: "border-l-red-500",
  REQUIRES_REPLY: "border-l-amber-500",
  MEETING: "border-l-violet-500",
  INFORMATIONAL: "border-l-blue-500",
  LOW_PRIORITY: "border-l-slate-300",
  SPAM: "border-l-rose-500",
}
// -------------------------------------------------------

interface InboxListProps {
  emails: InboxEmail[]
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (id: string) => void
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

function CategoryBadge({ category }: { category: EmailCategory | null }) {
  if (!category) return null
  return (
    <Badge variant="secondary" className={CATEGORY_BADGE_STYLES[category]}>
      {category.replace("_", " ").toLowerCase()}
    </Badge>
  )
}

export default function InboxList({
  emails,
  loading,
  error,
  selectedId,
  onSelect,
  page,
  totalPages,
  onPageChange,
}: InboxListProps) {
  if (loading && emails.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>
  }

  if (emails.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No emails found.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 divide-y divide-border overflow-y-auto">
        {emails.map((email) => (
          <button
            key={email.id}
            onClick={() => onSelect(email.id)}
            className={[
              "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-l-4",
              selectedId === email.id ? "bg-muted" : "",
              email.category
                ? CATEGORY_BORDER_COLORS[email.category]
                : "border-l-transparent",
            ].join(" ")}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {email.from_email}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(email.received_at).toLocaleDateString()}
                </span>
              </div>
              <p className="truncate text-sm text-foreground">
                {email.subject || "No subject"}
              </p>
              {email.suggested_action && (
                <p className="truncate text-xs text-muted-foreground">
                  {email.suggested_action}
                </p>
              )}
            </div>
            <CategoryBadge category={email.category} />
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}