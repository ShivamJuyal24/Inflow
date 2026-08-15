import { Annotation } from "@langchain/langgraph";
import type { Email } from "../types/email";
import type { EmailClassification } from "../types/classification";
import type { EmailAction } from "../types/action";
import type { EmailDraft } from "../types/draft";

export const StateAnnotation = Annotation.Root({
  emails: Annotation<Email[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  classification: Annotation<EmailClassification[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  actions: Annotation<EmailAction[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  drafts: Annotation<EmailDraft[]>({
    reducer: (_, next) => next,
    default: () => [],
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