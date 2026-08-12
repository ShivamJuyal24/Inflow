import { Annotation } from "@langchain/langgraph";
import type { Email } from "../types/email";

export const StateAnnotation = Annotation.Root({
  emails: Annotation<Email[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  category: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  draft: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  calendarSlots: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  approvalStatus: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

export type EmailTriageState = typeof StateAnnotation.State;