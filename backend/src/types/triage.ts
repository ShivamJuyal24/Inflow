export type TriageRunStatus = "COMPLETED" | "PARTIAL";

export interface TriageSummary {
  emailsFetched: number;
  emailsClassified: number;
  /**
   * Fetched emails that ended the run without a persisted classification
   * (provider error, invalid category, failed database write, or the batch
   * stopped early on a rate limit). They are retried on the next run.
   */
  emailsUnclassified: number;
  actionsCreated: number;
  draftsCreated: number;
  draftsPendingReview: number;
  meetingActions: number;
  /** PARTIAL when any fetched email was left unclassified. */
  status: TriageRunStatus;
}

export interface TriageRunResponse {
  message: string;
  summary: TriageSummary;
}

// Optional: for service-level return
export interface TriageRunResult {
  summary: TriageSummary;
}
