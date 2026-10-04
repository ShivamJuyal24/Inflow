import { graph } from "../graph/graph";
import { EmailTriageState } from "../graph/state";
import { supabase } from "../config/supabase";
import { TriageSummary } from "../types/triage";

export type TriageRunResult = {
  summary: TriageSummary;
};

export type TriageTrigger = "startup" | "scheduled" | "manual";

const INITIAL_STATE_BASE: Omit<EmailTriageState, "userId"> = {
  googleAccountId: "",
  accountEmail: "",
  emails: [],
  classification: [],
  actions: [],
  drafts: [],
  calendarSlots: [],
  approvalStatus: "PENDING",
};

let triageInProgress = false;

function createInitialState(userId: string): EmailTriageState {
  return {
    ...INITIAL_STATE_BASE,
    userId,
  };
}

function buildSummary(
  finalState: Partial<EmailTriageState>
): TriageSummary {
  const emails = finalState.emails ?? [];
  const classification = finalState.classification ?? [];

  const classifiedIds = new Set(
    classification.map((classification) => classification.messageId)
  );

  const emailsUnclassified = emails.filter(
    (email) => !classifiedIds.has(email.id)
  ).length;

  return {
    emailsFetched: emails.length,
    emailsClassified: classification.length,
    emailsUnclassified,
    actionsCreated: finalState.actions?.length ?? 0,
    draftsCreated: finalState.drafts?.length ?? 0,
    draftsPendingReview:
      finalState.drafts?.filter((draft) => draft.status === "PENDING_REVIEW")
        .length ?? 0,
    meetingActions:
      finalState.actions?.filter(
        (action) => action.type === "ANALYZE_MEETING"
      ).length ?? 0,
    status: emailsUnclassified > 0 ? "PARTIAL" : "COMPLETED",
  };
}

function combineSummaries(
  summaries: TriageSummary[]
): TriageSummary {
  const combined: TriageSummary = {
    emailsFetched: 0,
    emailsClassified: 0,
    emailsUnclassified: 0,
    actionsCreated: 0,
    draftsCreated: 0,
    draftsPendingReview: 0,
    meetingActions: 0,
    status: "COMPLETED",
  };

  for (const summary of summaries) {
    combined.emailsFetched += summary.emailsFetched;
    combined.emailsClassified += summary.emailsClassified;
    combined.emailsUnclassified += summary.emailsUnclassified;
    combined.actionsCreated += summary.actionsCreated;
    combined.draftsCreated += summary.draftsCreated;
    combined.draftsPendingReview += summary.draftsPendingReview;
    combined.meetingActions += summary.meetingActions;
  }

  if (combined.emailsUnclassified > 0) {
    combined.status = "PARTIAL";
  }

  return combined;
}

async function runForUser(
  trigger: TriageTrigger,
  userId: string
): Promise<TriageSummary> {
  const label = `[Triage:${trigger}:${userId}]`;

  console.log(`${label} Run started`);

  const finalState = await graph.invoke(createInitialState(userId));
  const summary = buildSummary(finalState);

  if (summary.status === "PARTIAL") {
    console.warn(
      `${label} Run finished PARTIALLY: ${summary.emailsUnclassified} of ` +
        `${summary.emailsFetched} fetched emails were not classified and will be retried:`,
      summary
    );
  } else {
    console.log(`${label} Run completed:`, summary);
  }

  return summary;
}

async function getOwnedUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("google_accounts")
    .select("user_id")
    .not("user_id", "is", null);

  if (error) {
    throw new Error(
      `Failed to get owned Google accounts: ${error.message}`
    );
  }

  return [
    ...new Set(
      (data ?? [])
        .map((row) => row.user_id)
        .filter(
          (userId): userId is string =>
            typeof userId === "string" && userId.length > 0
        )
    ),
  ];
}

export async function runInboxTriage(
  trigger: TriageTrigger,
  userId?: string
): Promise<TriageRunResult> {
  const label = `[Triage:${trigger}]`;

  if (triageInProgress) {
    console.log(`${label} Already in progress — skipping`);
    throw new Error("TRIAGE_ALREADY_RUNNING");
  }

  if (trigger === "manual" && !userId) {
    throw new Error("TRIAGE_USER_REQUIRED");
  }

  triageInProgress = true;

  try {
    if (trigger === "manual") {
      const { data: ownedAccount, error: ownershipError } = await supabase
        .from("google_accounts")
        .select("id")
        .eq("user_id", userId!)
        .limit(1)
        .maybeSingle();

      if (ownershipError) {
        throw new Error(
          `Failed to check Google account ownership: ${ownershipError.message}`
        );
      }

      if (!ownedAccount) {
        throw new Error("GMAIL_NOT_CONNECTED");
      }

      const summary = await runForUser(trigger, userId!);
      return { summary };
    }

    /*
     * Startup/scheduled runs have no HTTP request and therefore no
     * req.user. Enumerate only Google accounts that have explicitly
     * been attached to a Supabase Auth user.
     *
     * There is deliberately no `.limit(1)` fallback here.
     */
    const userIds = await getOwnedUserIds();

    console.log(
      `${label} Found ${userIds.length} owned Google account user(s)`
    );

    if (userIds.length === 0) {
      return {
        summary: combineSummaries([]),
      };
    }

    const summaries: TriageSummary[] = [];

    for (const ownedUserId of userIds) {
      summaries.push(await runForUser(trigger, ownedUserId));
    }

    return {
      summary: combineSummaries(summaries),
    };
  } catch (error) {
    console.error(`${label} Run failed:`, error);
    throw error;
  } finally {
    triageInProgress = false;
  }
}