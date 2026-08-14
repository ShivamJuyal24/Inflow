export const ActionType = {
    STORE: "STORE",
    REVIEW: "REVIEW",
    DRAFT_REPLY: "DRAFT_REPLY",
    ANALYZE_MEETING: "ANALYZE_MEETING",
  } as const;
  
  export type ActionType =
    (typeof ActionType)[keyof typeof ActionType];
  
  export type EmailAction = {
    messageId: string;
    type: ActionType;
    status: "PENDING" | "COMPLETED" | "FAILED";
  };