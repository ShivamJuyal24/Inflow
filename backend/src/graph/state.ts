import { Annotation } from "@langchain/langgraph";
import type { Email } from "../types/email";
import type { EmailClassification } from "../types/classification";
import type { EmailAction } from "../types/action";
import type { EmailDraft } from "../types/draft";

export const StateAnnotation = Annotation.Root({
  /**
   * Supabase Auth user who owns the Google account being triaged.
   */
  userId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /**
   * Google account row that owns the mailbox being triaged.
   */
  googleAccountId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  /**
   * Email of the connected Google account that owns the mailbox being
   * triaged. Set by fetchNode from google_accounts and used by
   * persistNode for account attribution — never derived from message
   * headers, which hold the sender/recipient, not the mailbox owner.
   */
  accountEmail: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

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