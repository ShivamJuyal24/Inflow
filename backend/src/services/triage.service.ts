// backend/src/services/triage.service.ts

import { graph } from "../graph/graph";
import { EmailTriageState } from "../graph/state";
import { TriageSummary } from "../types/triage";

export type TriageRunResult = {
  summary: TriageSummary;
};

export type TriageTrigger = "startup" | "scheduled" | "manual";

const INITIAL_STATE: EmailTriageState = {
  accountEmail: "",
  emails: [],
  classification: [],
  actions: [],
  drafts: [],
  calendarSlots: [],
  approvalStatus: "PENDING",
};

let triageInProgress = false;

export async function runInboxTriage(
  trigger: TriageTrigger
): Promise<TriageRunResult> {
  const label = `[Triage:${trigger}]`;

  // Prevent overlapping runs
  if (triageInProgress) {
    console.log(`${label} Already in progress — skipping`);
    throw new Error("TRIAGE_ALREADY_RUNNING");
  }

  triageInProgress = true;

  try {
    console.log(`${label} Run started`);

    // Invoke the compiled graph
    const finalState = await graph.invoke(INITIAL_STATE);

    const emails = finalState.emails ?? [];
    const classification = finalState.classification ?? [];

    // An email is unclassified if the classify node did not return a
    // persisted classification for it (see classifyNode).
    const classifiedIds = new Set(classification.map((c) => c.messageId));
    const emailsUnclassified = emails.filter(
      (email) => !classifiedIds.has(email.id)
    ).length;

    // Build summary
    const summary: TriageSummary = {
      emailsFetched: emails.length,
      emailsClassified: classification.length,
      emailsUnclassified,
      actionsCreated: finalState.actions?.length ?? 0,
      draftsCreated: finalState.drafts?.length ?? 0,
      draftsPendingReview:
        finalState.drafts?.filter((d) => d.status === "PENDING_REVIEW")
          .length ?? 0,
      meetingActions:
        finalState.actions?.filter((a) => a.type === "ANALYZE_MEETING")
          .length ?? 0,
      status: emailsUnclassified > 0 ? "PARTIAL" : "COMPLETED",
    };

    if (summary.status === "PARTIAL") {
      console.warn(
        `${label} Run finished PARTIALLY: ${emailsUnclassified} of ` +
          `${emails.length} fetched emails were not classified and will be retried:`,
        summary
      );
    } else {
      console.log(`${label} Run completed:`, summary);
    }

    return { summary };
  } catch (error) {
    console.error(`${label} Run failed:`, error);
    throw error;
  } finally {
    triageInProgress = false;
  }
}
