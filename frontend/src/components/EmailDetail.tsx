import { Badge } from "@/components/ui/badge"
import type { InboxEmail } from "@/types/email"
import {
  CATEGORY_BADGE_STYLES,
  CATEGORY_BORDER_COLORS,
} from "./InboxList"

interface EmailDetailProps {
  email: InboxEmail & { body: string }
}

export default function EmailDetail({ email }: EmailDetailProps) {
  const borderClass = email.category
    ? CATEGORY_BORDER_COLORS[email.category]
    : "border-l-transparent"

  return (
    <div
      className={`flex h-full flex-col gap-6 overflow-y-auto p-6 border-l-4 ${borderClass}`}
    >
      <div className="border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            {email.subject || "No subject"}
          </h2>
          {email.category && (
            <Badge variant="secondary" className={CATEGORY_BADGE_STYLES[email.category]}>
              {email.category.replace("_", " ").toLowerCase()}
            </Badge>
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">From:</span> {email.from_email}
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Received:</span>{" "}
          {new Date(email.received_at).toLocaleString()}
        </div>
      </div>

      {(email.classification_reason || email.suggested_action) && (
        <section className="rounded-lg border border-border bg-muted/40 p-4">
          {email.classification_reason && (
            <p className="text-sm text-foreground">
              <span className="font-medium">Why: </span>
              {email.classification_reason}
            </p>
          )}
          {email.suggested_action && (
            <p className="mt-1 text-sm text-foreground">
              <span className="font-medium">Suggested action: </span>
              {email.suggested_action}
            </p>
          )}
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Email
        </h3>
        <div className="whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-4 text-sm leading-relaxed text-foreground">
          {email.body}
        </div>
      </section>

      <div className="mt-auto text-sm italic text-muted-foreground">
        No reply draft has been generated for this email yet.
      </div>
    </div>
  )
}