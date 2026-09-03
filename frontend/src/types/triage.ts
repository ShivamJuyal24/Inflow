export type TriageSummary = {
    emailsFetched: number;
    emailsClassified: number;
    actionsCreated: number;
    draftsCreated: number;
    draftsPendingReview: number;
    meetingActions: number;
  };
  
  export type TriageRunResponse = {
    message: string;
    summary: TriageSummary;
  };