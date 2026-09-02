export interface TriageSummary {

    emailsFetched: number;
    emailsClassified: number;
    actionsCreated: number;
    draftsCreated: number;
    draftsPendingReview: number;
    meetingActions: number;
}

export interface TriageRunResponse{
    message: string;
    summary: TriageSummary;
}