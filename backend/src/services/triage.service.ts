// backend/src/services/triage.service.ts

import { graph } from "../graph/graph";
import { EmailTriageState } from "../graph/state";
import { TriageSummary } from "../types/triage";

export type TriageRunResult = {
  summary: TriageSummary;
};

export type TriageTrigger = "startup" | "scheduled" | "manual";

const INITIAL_STATE: EmailTriageState = {
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

    // Build summary
    const summary: TriageSummary = {
      emailsFetched: finalState.emails?.length ?? 0,
      emailsClassified: finalState.classification?.length ?? 0,
      actionsCreated: finalState.actions?.length ?? 0,
      draftsCreated: finalState.drafts?.length ?? 0,
      draftsPendingReview:
        finalState.drafts?.filter((d) => d.status === "PENDING_REVIEW")
          .length ?? 0,
      meetingActions:
        finalState.actions?.filter((a) => a.type === "ANALYZE_MEETING")
          .length ?? 0,
    };

    console.log(`${label} Run completed:`, summary);

    return { summary };
  } catch (error) {
    console.error(`${label} Run failed:`, error);
    throw error;
  } finally {
    triageInProgress = false;
  }
}