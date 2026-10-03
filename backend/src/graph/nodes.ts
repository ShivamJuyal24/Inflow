import { END } from "@langchain/langgraph";
import { EmailTriageState } from "./state";
import { getMessage, listAllMessages,listMessagePage } from "../services/gmail.service";
import { parseGmailMessage } from "../services/email.parser";
import type { Email } from "../types/email";
import { supabase } from "../config/supabase";
import { groq } from "../config/groq";

import { getGmailSyncConfig } from "../config/gmailSync";
import type { EmailDraft } from "../types/draft";
import {
  LLMEmailClassificationSchema,
  type EmailClassification,
} from "../types/classification";
import type { ActionType, EmailAction } from "../types/action";
import { mapClassificationToAction } from "./actionMapper";
import { CATEGORY_DETAILS, classifyWithJev, cleanEmailBody } from "./jevClassifier";

/**
 * Small delay between classification requests.
 * This helps avoid rate-limit issues when processing
 * many emails.
 */
const DELAY_BETWEEN_REQUESTS_MS = 1000;

/**
 * Supabase/PostgREST filters `.in()` values into the request URL, so a
 * run over a large message window would produce URLs past the gateway
 * limit. Lookups and updates are chunked to stay well under it.
 */
const IN_CLAUSE_CHUNK_SIZE = 50;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Action types whose downstream nodes (draftWorkFlow, meetingWorkFlow)
 * need the full email body in graph state. Only emails with a PENDING
 * action of one of these types must be re-fetched on later runs.
 */
const WORKFLOW_ACTION_TYPES: ActionType[] = ["DRAFT_REPLY", "ANALYZE_MEETING"];

/**
 * Existing `emails` rows for the given Gmail message IDs, mapped as
 * message_id -> category (null when persisted but not yet classified).
 * Absent from the map means the message was never persisted.
 */

/**
 * One query per chunk: which messages have any action at all, and which
 * have a PENDING workflow action (body still needed downstream).
 */
async function loadActionMeta(messageIds: string[]) {
  const hasAction = new Set<string>();
  const pendingWorkflow = new Set<string>();

  for (const chunk of chunkArray(messageIds, IN_CLAUSE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("email_actions")
      .select("message_id, action_type, status")
      .in("message_id", chunk);

    if (error) {
      throw new Error(`Failed to check email actions: ${error.message}`);
    }

    for (const row of data ?? []) {
      hasAction.add(row.message_id);
      if (
        row.status === "PENDING" &&
        WORKFLOW_ACTION_TYPES.includes(row.action_type)
      ) {
        pendingWorkflow.add(row.message_id);
      }
    }
  }

  return { hasAction, pendingWorkflow };
}

/**
 * Pages the inbox newest-first and collects IDs that still need work:
 *  - never persisted
 *  - persisted but unclassified
 *  - classified but no action row (action write failed earlier)
 *  - PENDING draft/meeting action (body needed by the workflow)
 * Stops once `maxMessages` are found, so finished mail never blocks
 * older unprocessed mail.
 */
async function collectIdsNeedingWork(
  refreshToken: string,
  opts: { pageSize: number; maxMessages: number; maxScan: number }
): Promise<{ ids: string[]; scanned: number }> {
  const needing: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  let scanned = 0;
  let pageIndex = 0;

  do {
    let page;
    try {
      page = await listMessagePage(refreshToken, {
        maxResults: Math.min(opts.pageSize, opts.maxScan - scanned),
        pageToken,
      });
    } catch (err: any) {
      throw new Error(
        `Gmail list failed on page ${pageIndex}: ${err?.message ?? err}`
      );
    }

    scanned += page.messages.length;
    pageIndex += 1;
    if (page.messages.length === 0) break;

    const pageIds: string[] = [];
    for (const m of page.messages) {
      if (typeof m.id === "string" && m.id && !seen.has(m.id)) {
        seen.add(m.id);
        pageIds.push(m.id);
      }
    }

    if (pageIds.length > 0) {
      const [existingMeta, actionMeta] = await Promise.all([
        loadExistingEmailMeta(pageIds),
        loadActionMeta(pageIds),
      ]);

      for (const id of pageIds) {
        const persisted = existingMeta.has(id);
        const needsWork =
          !persisted ||
          existingMeta.get(id) == null ||
          !actionMeta.hasAction.has(id) ||
          actionMeta.pendingWorkflow.has(id);
        if (needsWork) needing.push(id);
      }
    }

    pageToken = page.nextPageToken;
  } while (
    pageToken &&
    needing.length < opts.maxMessages &&
    scanned < opts.maxScan
  );

  if (pageToken && scanned >= opts.maxScan && needing.length < opts.maxMessages) {
    console.warn(
      `Scan ceiling (${opts.maxScan}) reached before filling the batch; ` +
        "older mail beyond it is not reached this run."
    );
  }

  return { ids: needing.slice(0, opts.maxMessages), scanned };
}

async function loadExistingEmailMeta(
  messageIds: string[]
): Promise<Map<string, string | null>> {
  const meta = new Map<string, string | null>();

  for (const chunk of chunkArray(messageIds, IN_CLAUSE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("emails")
      .select("message_id, category")
      .in("message_id", chunk);

    if (error) {
      throw new Error(`Failed to check existing emails: ${error.message}`);
    }

    for (const row of data ?? []) {
      meta.set(row.message_id, row.category);
    }
  }

  return meta;
}

/**
 * Gmail message IDs that have a PENDING workflow action (draft or
 * meeting) and therefore still need their full body fetched.
 */
async function loadPendingWorkflowMessageIds(
  messageIds: string[]
): Promise<Set<string>> {
  const pending = new Set<string>();

  for (const chunk of chunkArray(messageIds, IN_CLAUSE_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from("email_actions")
      .select("message_id")
      .in("message_id", chunk)
      .eq("status", "PENDING")
      .in("action_type", WORKFLOW_ACTION_TYPES);

    if (error) {
      throw new Error(
        `Failed to check pending email actions: ${error.message}`
      );
    }

    for (const row of data ?? []) {
      pending.add(row.message_id);
    }
  }

  return pending;
}



/**
 * Sleep helper used between Groq requests.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


/* =========================================================
   FETCH NODE
   ========================================================= */

export async function fetchNode(
  state: EmailTriageState
): Promise<Partial<EmailTriageState>> {
  console.log("fetch node running");

  const { data, error } = await supabase
    .from("google_accounts")
    .select("email, refresh_token")
    .limit(1)
    .single();

  if (error) {
    throw new Error(
      `Failed to get Google account: ${error.message}`
    );
  }

  console.log("📧 Google account:", data.email);

  // Paginate the inbox (newest first) up to the configured per-run
  // window — GMAIL_PAGE_SIZE per request, at most GMAIL_MAX_MESSAGES
  // per run (see config/gmailSync.ts).
  const { pageSize, maxMessages, maxScan } = getGmailSyncConfig();

  const { ids: idsNeedingFetch, scanned } = await collectIdsNeedingWork(
    data.refresh_token,
    { pageSize, maxMessages, maxScan }
  );

  console.log(
    `Scanned ${scanned} messages; ${idsNeedingFetch.length} need work`
  );

  if (idsNeedingFetch.length === 0) {
    return { emails: [], accountEmail: data.email };
  }

  const emails: Email[] = [];

  for (const messageId of idsNeedingFetch) {
    let fullMessage;
    try {
      fullMessage = await getMessage(data.refresh_token, messageId);
    } catch (err: any) {
      // One unreachable message must not lose the whole batch: skip it
      // here and leave it unpersisted so the next run retries it.
      console.error(
        `Failed to fetch message ${messageId} — will retry on next run:`,
        err?.message ?? err
      );
      continue;
    }

    emails.push(parseGmailMessage(fullMessage));
  }

  console.log(`Parsed ${emails.length} emails`);

  return {
    emails,
    accountEmail: data.email,
  };
}


/* =========================================================
   PERSIST NODE
   ========================================================= */

export async function persistNode(
  state: EmailTriageState
): Promise<Partial<EmailTriageState>> {
  console.log("Persist node running");

  if (state.emails.length === 0) {
    console.log("No emails to persist");
    return {};
  }

  // Attribution: the connected Google account that owns the mailbox —
  // from graph state (set by fetchNode), with a direct fallback lookup
  // when persistNode runs outside the normal graph flow.
  let accountEmail = state.accountEmail;

  if (!accountEmail) {
    const { data: account, error: accountError } = await supabase
      .from("google_accounts")
      .select("email")
      .limit(1)
      .single();

    if (accountError) {
      throw new Error(
        `Failed to get Google account for attribution: ${accountError.message}`
      );
    }

    accountEmail = account.email;
  }

  const rows = state.emails.map((email) => ({
    message_id: email.id,
    thread_id: email.threadId,
    account_email: accountEmail,
    from_email: email.from,
    to_email: email.to,
    subject: email.subject,
    body: email.body,
    received_at: email.receivedAt,
  }));

  // Atomic upsert keyed on the unique index over emails.message_id:
  // a retried or overlapping run conflicts in the database instead of
  // racing a check-then-insert window. Existing rows are left as-is.
  const { data, error } = await supabase
    .from("emails")
    .upsert(rows, { onConflict: "message_id", ignoreDuplicates: true })
    .select();

  if (error) {
    throw new Error(
      `Failed to persist emails: ${error.message}`
    );
  }

  console.log(
    `Persisted ${data.length} new emails ` +
      `(${rows.length - data.length} already existed)`
  );

  return {};
}


/* =========================================================
   CLASSIFY NODE  (with persistence + skip logic)
   ========================================================= */

export async function classifyNode(
    state: EmailTriageState
  ): Promise<Partial<EmailTriageState>> {
    console.log("Classify node running");
  
    if (state.emails.length === 0) {
      console.log("No emails to classify");
      return { classification: [] };
    }
  
    const messageIds = state.emails.map((e) => e.id);
  
    /* ── 1. Load existing classifications from Supabase ── */
    const existingRows: {
      message_id: string;
      category: EmailClassification["category"];
      classification_reason: string;
      suggested_action: string;
    }[] = [];

    for (const chunk of chunkArray(messageIds, IN_CLAUSE_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("emails")
        .select(
          "message_id, category, classification_reason, suggested_action, classified_at"
        )
        .in("message_id", chunk)
        .not("category", "is", null);

      if (error) {
        throw new Error(
          `Failed to check existing classifications: ${error.message}`
        );
      }

      existingRows.push(...(data ?? []));
    }
  
    const existingMap = new Map<string, EmailClassification>(
      existingRows.map((row) => [
        row.message_id,
        {
          messageId: row.message_id,
          category: row.category,
          reason: row.classification_reason,
          suggested_action: row.suggested_action,
        },
      ])
    );
  
    console.log(
      `Found ${existingMap.size} already-classified emails in Supabase`
    );
  
    /* ── 2. Only classify emails without a stored category ── */
    const emailsToClassify = state.emails.filter(
      (email) => !existingMap.has(email.id)
    );
  
    console.log(`Emails to classify via Jev: ${emailsToClassify.length}`);

    // Fail the run loudly on a configuration problem instead of letting every
    // email fail individually, be skipped, and the run look "complete".
    if (emailsToClassify.length > 0 && !process.env.JEVMODEL_API_KEY) {
      throw new Error(
        "Missing JEVMODEL_API_KEY environment variable — cannot classify emails"
      );
    }

    const classifications: EmailClassification[] = Array.from(
      existingMap.values()
    );

    // Emails that were attempted but did not end up classified AND persisted.
    // Their `emails.category` stays NULL, so collectIdsNeedingWork picks them
    // up again on the next run.
    const failures: { messageId: string; reason: string }[] = [];
    let attempted = 0;
    let rateLimited = false;

    for (let i = 0; i < emailsToClassify.length; i++) {
      const email = emailsToClassify[i];
      attempted += 1;

      console.log(`Classifying email: ${email.id}`);

      const cleanedBody = cleanEmailBody(email.body);

      console.log(`Original body length: ${email.body.length}`);
      console.log(`Classification body length: ${cleanedBody.length}`);

      try {
        const category = await classifyWithJev(email, cleanedBody);
        const details = CATEGORY_DETAILS[category];

        // Deterministic metadata: no additional LLM call.
        const result = LLMEmailClassificationSchema.safeParse({
          category,
          reason: details.reason,
          suggested_action: details.suggested_action,
        });

        if (!result.success) {
          console.error("Invalid classification:", result.error.flatten());
          throw new Error(
            `Invalid classification returned by Jev for email ${email.id}`
          );
        }

        const classification: EmailClassification = {
          messageId: email.id,
          ...result.data,
        };

        /* ── 3. Persist classification to Supabase ── */
        // A classification only counts once it is stored. Selecting the
        // updated row also catches an update that matched nothing.
        const { data: updatedRows, error: updateError } = await supabase
          .from("emails")
          .update({
            category: classification.category,
            classification_reason: classification.reason,
            suggested_action: classification.suggested_action,
            classified_at: new Date().toISOString(),
          })
          .eq("message_id", email.id)
          .select("message_id");

        if (updateError) {
          throw new Error(
            `Failed to persist classification: ${updateError.message}`
          );
        }

        if (!updatedRows || updatedRows.length === 0) {
          throw new Error(
            "Failed to persist classification: no matching email row was updated"
          );
        }

        console.log(`Persisted classification for ${email.id}`);
        classifications.push(classification);

        console.log(
          `Classification: ${classification.category} — ${classification.reason}`
        );
        console.log(`Verified messageId: ${classification.messageId}`);
      } catch (error: any) {
        const reason = error?.message ?? String(error);
        failures.push({ messageId: email.id, reason });
        console.error(`Failed to classify email ${email.id}:`, reason);

        if (error?.status === 429) {
          console.warn(
            "Rate limit hit — stopping classification batch early. " +
              `${emailsToClassify.length - attempted} emails were not attempted this run.`
          );
          rateLimited = true;
          break;
        }
      }

      if (i < emailsToClassify.length - 1) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    const notAttempted = emailsToClassify.length - attempted;
    const classifiedNow = emailsToClassify.length - failures.length - notAttempted;

    console.log(
      `Classified ${classifiedNow}/${emailsToClassify.length} new emails ` +
        `(${existingMap.size} already classified, ${failures.length} failed, ` +
        `${notAttempted} not attempted${
          rateLimited ? " — batch stopped early due to rate limit" : ""
        })`
    );

    if (failures.length > 0) {
      console.warn(
        "Classification failures (will be retried next run):",
        failures
      );
    }

    return { classification: classifications };
  }
  /* =========================================================
     MEETING NODE
     ========================================================= */
  
  export async function meetingNode(
    state: EmailTriageState
  ): Promise<Partial<EmailTriageState>> {
    console.log("Meeting node running");
  
    return {};
  }

export async function actionNode(
  state: EmailTriageState
): Promise<Partial<EmailTriageState>> {
  console.log("Action node running");

  const actions = state.classification.map(mapClassificationToAction);

  if (actions.length === 0) {
    console.log("No actions to persist");
    return { actions };
  }

  // De-duplicate within this run; the database unique constraint on
  // (message_id, action_type) plus ON CONFLICT DO NOTHING makes the
  // write idempotent across runs and safe under overlapping runs —
  // there is no check-then-insert race window left in the application.
  const actionKey = (messageId: string, actionType: string) =>
    `${messageId}\u0000${actionType}`;

  const seenKeys = new Set<string>();
  const rows = [];

  for (const action of actions) {
    const key = actionKey(action.messageId, action.type);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    rows.push({
      message_id: action.messageId,
      action_type: action.type,
      status: action.status,
    });
  }

  if (rows.length === 0) {
    return { actions };
  }

  const { data, error } = await supabase
    .from("email_actions")
    .upsert(rows, {
      onConflict: "message_id,action_type",
      ignoreDuplicates: true,
    })
    .select("message_id");

  if (error) {
    throw new Error(`Failed to persist email actions: ${error.message}`);
  }

  console.log(
    `Persisted ${data.length} new email actions ` +
      `(${rows.length - data.length} already existed)`
  );

  return { actions };
}

  export function routeActions(
    state: EmailTriageState
  ): string | string[] {
    const destinations = new Set<string>();
  
    for (const action of state.actions) {
      if (action.type === "DRAFT_REPLY") {
        destinations.add("draftWorkFlow");
      }
  
      if (action.type === "ANALYZE_MEETING") {
        destinations.add("meetingWorkFlow");
      }
    }
  
    if (destinations.size === 0) {
      return END;
    }
  
    return Array.from(destinations);
  }


/* =========================================================
   DRAFT NODE
   ========================================================= */

/* =========================================================
   DRAFT NODE
   ========================================================= */

   export async function draftNode(
    state: EmailTriageState
  ): Promise<Partial<EmailTriageState>> {
    console.log("Draft node running");
  
    const draftActions = state.actions.filter(
      (action) => action.type === "DRAFT_REPLY"
    );
  
    if (draftActions.length === 0) {
      console.log("No DRAFT_REPLY actions to process");
      return {};
    }
  
    const messageIds = [...new Set(draftActions.map((action) => action.messageId))];
  
    // 1. Look up Supabase email UUIDs for these Gmail message IDs
    const emailRows: { id: string; message_id: string }[] = [];

    for (const chunk of chunkArray(messageIds, IN_CLAUSE_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("emails")
        .select("id, message_id")
        .in("message_id", chunk);

      if (error) {
        throw new Error(`Failed to look up email IDs: ${error.message}`);
      }

      emailRows.push(...(data ?? []));
    }
  
    const messageIdToEmailId = new Map(
      emailRows.map((row) => [row.message_id, row.id])
    );
  
    // 2. Find already-persisted drafts so their actions can be reconciled.
    const emailIds = Array.from(messageIdToEmailId.values());
    const existingDraftRows: { email_id: string }[] = [];

    for (const chunk of chunkArray(emailIds, IN_CLAUSE_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("drafts")
        .select("email_id")
        .in("email_id", chunk);

      if (error) {
        throw new Error(
          `Failed to check existing drafts: ${error.message}`
        );
      }

      existingDraftRows.push(...(data ?? []));
    }
  
    const existingEmailIds = new Set(
      existingDraftRows.map((d) => d.email_id)
    );
    const completedMessageIds = new Set(
      messageIds.filter((messageId) => {
        const emailId = messageIdToEmailId.get(messageId);
        return emailId !== undefined && existingEmailIds.has(emailId);
      })
    );

    const actionsToProcess = messageIds.filter((messageId) => {
      const emailId = messageIdToEmailId.get(messageId);
      return emailId !== undefined && !existingEmailIds.has(emailId);
    });
  
    const drafts: EmailDraft[] = [];
  
    for (const messageId of actionsToProcess) {
      const email = state.emails.find((email) => email.id === messageId);
  
      if (!email) {
        console.warn(
          `Email ${messageId} not found — skipping draft generation`
        );
        continue;
      }
  
      console.log(`Generating draft for: ${email.id} (${email.subject})`);
  
      const bodyForLLM =
        email.body.length > 8000
          ? email.body.slice(0, 8000) + "\n\n[Email body truncated]"
          : email.body;
  
      const prompt = `
  You are a professional email assistant. Draft a polite, concise reply to the email below.
  
  Guidelines:
  - Address the sender's main points directly.
  - Keep it brief and professional.
  - Do NOT include a subject line.
  - Use a generic sign-off such as "Best regards" or "Thanks" — do NOT invent a sender name.
  
  Original email:
  From: ${email.from}
  To: ${email.to}
  Subject: ${email.subject}
  
  Body:
  ${bodyForLLM}
  
  Draft the reply:
  `;
  
      try {
        const completion = await groq.chat.completions.create({
          model: "openai/gpt-oss-120b",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "You are a professional email drafting assistant. Write clear, concise, and polite replies.",
            },
            { role: "user", content: prompt },
          ],
        });
  
        const draftBody = completion.choices[0]?.message?.content?.trim();
  
        if (!draftBody) {
          console.warn(`Empty draft returned for ${email.id}`);
          continue;
        }
  
        drafts.push({
          messageId: email.id,
          draftBody,
          status: "PENDING_REVIEW",
        });
  
        console.log(
          `Draft generated for ${email.id} (${draftBody.length} chars)`
        );
      } catch (error: any) {
        console.error(
          `Failed to generate draft for ${email.id}:`,
          error?.message ?? error
        );
  
        if (error?.status === 429) {
          console.warn("Rate limit hit — stopping draft generation early.");
          break;
        }
      }
  
      if (messageId !== actionsToProcess[actionsToProcess.length - 1]) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }
  
    // 3. The existing unique constraint on drafts.email_id makes this safe
    // when concurrent graph runs both generate a draft for the same email.
    if (drafts.length > 0) {
      const draftRows = drafts.map((draft) => ({
        email_id: messageIdToEmailId.get(draft.messageId),
        body: draft.draftBody,
        status: draft.status,
      }));
  
      const { error: upsertError } = await supabase
        .from("drafts")
        .upsert(draftRows, { onConflict: "email_id", ignoreDuplicates: true });
  
      if (upsertError) {
        throw new Error(`Failed to persist drafts: ${upsertError.message}`);
      }
  
      for (const draft of drafts) {
        completedMessageIds.add(draft.messageId);
      }
      console.log(`Persisted ${drafts.length} reply drafts`);
    }
  
    // 4. Reconcile actions for both existing and newly persisted drafts.
    if (completedMessageIds.size > 0) {
      const completedIds = Array.from(completedMessageIds);

      for (const chunk of chunkArray(completedIds, IN_CLAUSE_CHUNK_SIZE)) {
        const { error: updateError } = await supabase
          .from("email_actions")
          .update({ status: "COMPLETED" })
          .in("message_id", chunk)
          .eq("action_type", "DRAFT_REPLY");

        if (updateError) {
          throw new Error(
            `Failed to update action statuses: ${updateError.message}`
          );
        }
      }

      console.log(
        `Updated ${completedIds.length} DRAFT_REPLY actions to COMPLETED`
      );
    }

    const updatedActions = state.actions.map((action) => {
      if (
        action.type === "DRAFT_REPLY" &&
        completedMessageIds.has(action.messageId)
      ) {
        return { ...action, status: "COMPLETED" as const };
      }
      return action;
    });
  
    return { drafts, actions: updatedActions };
  }
