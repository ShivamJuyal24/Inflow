import { END } from "@langchain/langgraph";
import { EmailTriageState } from "./state";
import { getMessage, listMessages } from "../services/gmail.service";
import { parseGmailMessage } from "../services/email.parser";
import type { Email } from "../types/email";
import { supabase } from "../config/supabase";
import { groq } from "../config/groq";
import type { EmailDraft } from "../types/draft";
import {
  LLMEmailClassificationSchema,
  type EmailClassification,
} from "../types/classification";
import type { EmailAction } from "../types/action";
import { mapClassificationToAction } from "./actionMapper";
/**
 * Maximum number of characters from an email body
 * that will be sent to the LLM.
 *
 * This prevents huge newsletters / HTML emails / tracking
 * links from consuming the Groq token limit.
 */
const MAX_BODY_LENGTH = 5000;

/**
 * Small delay between Groq requests.
 * This helps avoid TPM/rate-limit issues when processing
 * many emails.
 */
const DELAY_BETWEEN_REQUESTS_MS = 1000;

/**
 * Clean an email body before sending it to the LLM.
 *
 * Gmail emails can contain:
 * - huge HTML content
 * - tracking URLs
 * - unsubscribe links
 * - duplicated content
 * - marketing boilerplate
 *
 * We don't need all of that for classification.
 */
function cleanEmailBody(body: string): string {
  if (!body) {
    return "";
  }

  let cleaned = body;

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, "");

  // Remove lines that are basically tracking URLs
  cleaned = cleaned.replace(
    /^\s*\[https?:\/\/.*\]\s*$/gim,
    ""
  );

  // Remove excessive whitespace
  cleaned = cleaned.replace(/\r/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ");

  cleaned = cleaned.trim();

  // Limit body size
  if (cleaned.length > MAX_BODY_LENGTH) {
    cleaned =
      cleaned.slice(0, MAX_BODY_LENGTH) +
      "\n\n[Email body truncated for classification]";
  }

  return cleaned;
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

  // Get 20 recent unread emails from inbox
  const messages = await listMessages(
    data.refresh_token,
    10
  );

  console.log("Messages found:", messages.length);

  const emails: Email[] = [];

  for (const message of messages) {
    if (!message.id) {
      continue;
    }

    const fullMessage = await getMessage(
      data.refresh_token,
      message.id
    );

    const email = parseGmailMessage(fullMessage);

    emails.push(email);
  }

  console.log(`Parsed ${emails.length} emails`);

  return {
    emails,
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

  const messageIds = state.emails.map(
    (email) => email.id
  );

  // Find emails that already exist
  const {
    data: existingEmails,
    error: existingError,
  } = await supabase
    .from("emails")
    .select("message_id")
    .in("message_id", messageIds);

  if (existingError) {
    throw new Error(
      `Failed to check existing emails: ${existingError.message}`
    );
  }

  const existingMessageIds = new Set(
    existingEmails?.map(
      (email) => email.message_id
    ) ?? []
  );

  // Only persist new emails
  const newEmails = state.emails.filter(
    (email) =>
      !existingMessageIds.has(email.id)
  );

  console.log(
    `Found ${existingEmails?.length ?? 0} existing emails`
  );

  console.log(
    `New emails to persist: ${newEmails.length}`
  );

  if (newEmails.length === 0) {
    console.log("No new emails to persist");
    return {};
  }

  const rows = newEmails.map((email) => ({
    message_id: email.id,
    thread_id: email.threadId,
    account_email: email.to,
    from_email: email.from,
    to_email: email.to,
    subject: email.subject,
    body: email.body,
    received_at: email.receivedAt,
  }));

  const { data, error } = await supabase
    .from("emails")
    .insert(rows)
    .select();

  if (error) {
    throw new Error(
      `Failed to persist emails: ${error.message}`
    );
  }

  console.log(
    `Persisted ${data.length} new emails`
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
    const { data: existingRows, error: existingError } = await supabase
      .from("emails")
      .select(
        "message_id, category, classification_reason, suggested_action, classified_at"
      )
      .in("message_id", messageIds)
      .not("category", "is", null);
  
    if (existingError) {
      throw new Error(
        `Failed to check existing classifications: ${existingError.message}`
      );
    }
  
    const existingMap = new Map<string, EmailClassification>(
      existingRows?.map((row) => [
        row.message_id,
        {
          messageId: row.message_id,
          category: row.category,
          reason: row.classification_reason,
          suggested_action: row.suggested_action,
        },
      ]) ?? []
    );
  
    console.log(
      `Found ${existingMap.size} already-classified emails in Supabase`
    );
  
    /* ── 2. Only classify emails without a stored category ── */
    const emailsToClassify = state.emails.filter(
      (email) => !existingMap.has(email.id)
    );
  
    console.log(`Emails to classify via LLM: ${emailsToClassify.length}`);
  
    const classifications: EmailClassification[] = Array.from(
      existingMap.values()
    );
  
    let rateLimited = false;
  
    for (const email of emailsToClassify) {
      console.log(`Classifying email: ${email.id}`);
  
      const cleanedBody = cleanEmailBody(email.body);
  
      console.log(`Original body length: ${email.body.length}`);
      console.log(`Classification body length: ${cleanedBody.length}`);
  
      const prompt = `
  You are an email classification agent.
  
  Classify the email into exactly ONE of these categories:
  
  SPAM
  LOW_PRIORITY
  INFORMATIONAL
  REQUIRES_REPLY
  MEETING
  IMPORTANT
  
  Category definitions:
  
  SPAM:
  Clearly unwanted, deceptive, suspicious, or irrelevant email.
  
  LOW_PRIORITY:
  Legitimate email that does not require attention or action.
  
  INFORMATIONAL:
  Useful information or notification that does not require a response.
  
  REQUIRES_REPLY:
  The sender explicitly expects or asks for a response.
  
  MEETING:
  The email involves a meeting, interview, appointment, scheduling,
  calendar invitation, or finding a time to meet.
  
  IMPORTANT:
  The email requires significant attention but does not fit better
  into another category.
  
  Decision rules:
  
  1. Choose exactly ONE category.
  
  2. If the email is clearly spam, suspicious, deceptive,
     or unwanted, choose SPAM.
  
  3. If the email involves scheduling, an interview,
     an appointment, a meeting, or finding a time to meet,
     choose MEETING.
  
  4. If the sender explicitly asks the recipient to respond,
     confirm something, provide information, or reply,
     and it is not primarily a meeting/scheduling email,
     choose REQUIRES_REPLY.
  
  5. If the email contains an urgent request, deadline,
     account/security issue, important work matter, or something
     that clearly requires the user's attention, choose IMPORTANT.
  
  6. Do not classify something as IMPORTANT merely because it is
     from a professional sender.
  
  7. Use INFORMATIONAL when the email provides useful information
     but does not require the user to take action.
  
  8. Use LOW_PRIORITY when the email is legitimate but provides
     little value and can safely be ignored.
  
  9. Job alerts, newsletters, promotional emails, and general
     notifications should usually be INFORMATIONAL or LOW_PRIORITY
     unless they explicitly require action.
  
  10. Do not assume every job opportunity requires a reply.
  
  11. If multiple rules appear applicable, choose the category that
      represents the most important action the user needs to take.
  
  Return ONLY valid JSON.
  
  Do NOT return a messageId.
  The application will attach the messageId itself.
  
  Return exactly this structure:
  
  {
    "category": "ONE_OF_THE_ALLOWED_CATEGORIES",
    "reason": "Short explanation of why this category was chosen.",
    "suggested_action": "What the email agent should do next."
  }
  
  Email information:
  
  From:
  ${email.from}
  
  To:
  ${email.to}
  
  Subject:
  ${email.subject}
  
  Body:
  ${cleanedBody}
  `;
  
      try {
        const completion = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You are a precise email classification system. Return only valid JSON containing category, reason, and suggested_action. Never generate or modify message IDs.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });
  
        const content = completion.choices[0]?.message?.content;
  
        if (!content) {
          throw new Error(`Groq returned empty response for email ${email.id}`);
        }
  
        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new Error(`Groq returned invalid JSON for email ${email.id}`);
        }
  
        const result = LLMEmailClassificationSchema.safeParse(parsed);
  
        if (!result.success) {
          console.error("Invalid classification:", result.error.flatten());
          throw new Error(
            `Invalid classification returned by Groq for email ${email.id}`
          );
        }
  
        const classification: EmailClassification = {
          messageId: email.id,
          category: result.data.category,
          reason: result.data.reason,
          suggested_action: result.data.suggested_action,
        };
  
        /* ── 3. Persist classification to Supabase ── */
        const { error: updateError } = await supabase
          .from("emails")
          .update({
            category: classification.category,
            classification_reason: classification.reason,
            suggested_action: classification.suggested_action,
            classified_at: new Date().toISOString(),
          })
          .eq("message_id", email.id);
  
        if (updateError) {
          console.error(
            `Failed to persist classification for ${email.id}:`,
            updateError.message
          );
          // Non-fatal: classification is still in memory
        } else {
          console.log(`Persisted classification for ${email.id}`);
        }
  
        classifications.push(classification);
  
        console.log(
          `Classification: ${classification.category} — ${classification.reason}`
        );
        console.log(`Verified messageId: ${classification.messageId}`);
      } catch (error: any) {
        console.error(
          `Failed to classify email ${email.id}:`,
          error?.message ?? error
        );
  
        if (error?.status === 429) {
          console.warn(
            "Rate limit hit — stopping classification batch early. " +
              `${classifications.length}/${state.emails.length} emails classified this run.`
          );
          rateLimited = true;
          break;
        }
      }
  
      if (email.id !== emailsToClassify[emailsToClassify.length - 1]?.id) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }
  
    console.log(
      `Classified ${classifications.length}/${state.emails.length} emails` +
        (rateLimited ? " (batch stopped early due to rate limit)" : "")
    );
  
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

  const messageIds = [...new Set(actions.map((action) => action.messageId))];
  const { data: existingActions, error: existingActionsError } = await supabase
    .from("email_actions")
    .select("message_id, action_type")
    .in("message_id", messageIds);

  if (existingActionsError) {
    throw new Error(
      `Failed to check existing email actions: ${existingActionsError.message}`
    );
  }

  const actionKey = (messageId: string, actionType: string) =>
    `${messageId}\u0000${actionType}`;
  const existingActionKeys = new Set(
    existingActions?.map((action) =>
      actionKey(action.message_id, action.action_type)
    ) ?? []
  );
  const newActionKeys = new Set<string>();
  const newActions = actions.filter((action) => {
    const key = actionKey(action.messageId, action.type);

    if (existingActionKeys.has(key) || newActionKeys.has(key)) {
      return false;
    }

    newActionKeys.add(key);
    return true;
  });

  if (newActions.length === 0) {
    console.log("All email actions already exist");
    return { actions };
  }

  const rows = newActions.map((action: EmailAction) => ({
    message_id: action.messageId,
    action_type: action.type,
    status: action.status,
  }));

  const { data, error } = await supabase
    .from("email_actions")
    .insert(rows)
    .select("message_id");

  if (error) {
    throw new Error(`Failed to persist email actions: ${error.message}`);
  }

  console.log(`Persisted ${data.length} new email actions`);

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
    const { data: emailRows, error: emailError } = await supabase
      .from("emails")
      .select("id, message_id")
      .in("message_id", messageIds);
  
    if (emailError) {
      throw new Error(`Failed to look up email IDs: ${emailError.message}`);
    }
  
    const messageIdToEmailId = new Map(
      emailRows?.map((row) => [row.message_id, row.id]) ?? []
    );
  
    // 2. Find already-persisted drafts so their actions can be reconciled.
    const emailIds = Array.from(messageIdToEmailId.values());
    const { data: existingDrafts, error: existingDraftsError } = await supabase
      .from("drafts")
      .select("email_id")
      .in("email_id", emailIds);
  
    if (existingDraftsError) {
      throw new Error(
        `Failed to check existing drafts: ${existingDraftsError.message}`
      );
    }
  
    const existingEmailIds = new Set(
      existingDrafts?.map((d) => d.email_id) ?? []
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
          model: "llama-3.3-70b-versatile",
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
      const { error: updateError } = await supabase
        .from("email_actions")
        .update({ status: "COMPLETED" })
        .in("message_id", completedIds)
        .eq("action_type", "DRAFT_REPLY");

      if (updateError) {
        throw new Error(`Failed to update action statuses: ${updateError.message}`);
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
