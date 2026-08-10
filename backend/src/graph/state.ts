import { Annotation } from "@langchain/langgraph";

export const StateAnnotation = Annotation.Root({
    email: Annotation<string | null>,
    category: Annotation<string | null>,
    draft: Annotation<string | null>,
    calendarSlots: Annotation<string[]>,
    approvalStatus: Annotation<string | null>,
});

export type EmailTriageState = typeof StateAnnotation.State;