// Follow-up detection: finds sent drafts that never got a reply and are
// older than FOLLOW_UP_DELAY_MS (default 3 days). Phase 3 will plug draft
// generation into `collectEligibleFollowUps`'s result.

import { supabase } from "../config/supabase.js";
import { groq } from "../config/groq.js";

export const FOLLOW_UP_DELAY_MS =
  Number(process.env.FOLLOW_UP_DELAY_MS) || 3 * 24 * 60 * 60 * 1000;

export const MAX_FOLLOW_UPS_PER_DRAFT = 1;

export type EligibleFollowUp = {
  draftId: string;
  emailId: string;
  sentAt: string;
  threadId: string;
  googleAccountId: string;
  recipientEmail: string;
  subject: string;
  originalBody: string;
  sentDraftBody: string;
};

type DraftRow = {
  id: string;
  email_id: string;
  sent_at: string;
  follow_up_count: number;
  body: string;
};

type EmailRow = {
  id: string;
  thread_id: string;
  google_account_id: string;
  from_email: string;
  subject: string;
  body: string;
};

/**
 * A reply means: any message in the same Gmail thread, in this account,
 * received AFTER we sent our draft. Since the emails table is fed from the
 * inbox, `from_email` there is the external party — so presence of such a
 * row already means "they wrote back".
 */
async function replyArrived(
  googleAccountId: string,
  threadId: string,
  sentAt: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("emails")
    .select("id")
    .eq("google_account_id", googleAccountId)
    .eq("thread_id", threadId)
    .gt("received_at", sentAt)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check replies: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

/**
 * Marks a draft as "do not follow up" — used both when a reply arrived
 * (no nagging needed) and, later, when a follow-up draft has been generated.
 */
export async function markFollowedUp(draftId: string): Promise<void> {
  const { error } = await supabase
    .from("drafts")
    .update({ followed_up_at: new Date().toISOString() })
    .eq("id", draftId)
    .is("followed_up_at", null);

  if (error) {
    throw new Error(`Failed to mark draft followed up: ${error.message}`);
  }
}

const DELAY_BETWEEN_FOLLOWUP_CALLS_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateFollowUpBody(
  eligible: EligibleFollowUp
): Promise<string | null> {
  const bodyForLLM =
    eligible.sentDraftBody.length > 4000
      ? eligible.sentDraftBody.slice(0, 4000) + "\n\n[Truncated]"
      : eligible.sentDraftBody;

  const prompt = `
You are a professional email assistant. Write a short, polite follow-up to an email we sent that received no reply.

Guidelines:
- Reference that this is a follow-up to our previous email, without sounding annoyed.
- 2-4 sentences, professional and low-pressure.
- Do NOT include a subject line.
- Use a generic sign-off such as "Best regards" or "Thanks" — do NOT invent a sender name.

Our previous message:
${bodyForLLM}

Subject of the original email: ${eligible.subject}

Write the follow-up:
`;

  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are a professional email drafting assistant. Write clear, concise, and polite follow-ups.",
      },
      { role: "user", content: prompt },
    ],
  });

  return completion.choices[0]?.message?.content?.trim() ?? null;
}

/**
 * Phase 3+4 entry point: scan for eligible drafts, generate one follow-up
 * draft each (PENDING_REVIEW, kind='follow_up'), and close out the original
 * draft so it never gets a second follow-up.
 */
export async function runFollowUpSweep(now: Date = new Date()): Promise<{
  generated: number;
  skipped: number;
}> {
  const eligible = await collectEligibleFollowUps(now);
  let generated = 0;
  let skipped = 0;

  for (const item of eligible) {
    try {
      const body = await generateFollowUpBody(item);

      if (!body) {
        console.warn(`Empty follow-up for draft ${item.draftId}`);
        skipped++;
        continue;
      }

      // Unique (email_id, kind) means a duplicate sweep can never create
      // two follow-ups for the same email.
      const { error: insertError } = await supabase.from("drafts").upsert(
        {
          email_id: item.emailId,
          body,
          status: "PENDING_REVIEW",
          kind: "follow_up",
        },
        { onConflict: "email_id,kind", ignoreDuplicates: true }
      );

      if (insertError) {
        console.error(
          `Failed to persist follow-up for ${item.draftId}:`,
          insertError.message
        );
        skipped++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("drafts")
        .update({
          followed_up_at: new Date().toISOString(),
          follow_up_count: 1,
        })
        .eq("id", item.draftId);

      if (updateError) {
        console.error(
          `Follow-up created but failed to close original draft ${item.draftId}:`,
          updateError.message
        );
      }

      generated++;
    } catch (error: any) {
      console.error(
        `Failed to generate follow-up for ${item.draftId}:`,
        error?.message ?? error
      );
      skipped++;

      if (error?.status === 429) {
        console.warn("Rate limit hit — stopping follow-up sweep early.");
        break;
      }
    }

    if (item !== eligible[eligible.length - 1]) {
      await sleep(DELAY_BETWEEN_FOLLOWUP_CALLS_MS);
    }
  }

  console.log(
    `Follow-up sweep: ${generated} generated, ${skipped} skipped, ${eligible.length} candidates`
  );
  return { generated, skipped };
}

export async function collectEligibleFollowUps(
  now: Date = new Date()
): Promise<EligibleFollowUp[]> {
  const cutoff = new Date(now.getTime() - FOLLOW_UP_DELAY_MS).toISOString();

  const { data: drafts, error } = await supabase
    .from("drafts")
    .select("id, email_id, sent_at, follow_up_count, body")
    .eq("status", "SENT")
    .eq("kind", "reply")
    .is("followed_up_at", null)
    .lt("follow_up_count", MAX_FOLLOW_UPS_PER_DRAFT)
    .lte("sent_at", cutoff)
    .limit(50);

  if (error) {
    throw new Error(`Failed to scan follow-up candidates: ${error.message}`);
  }

  const eligible: EligibleFollowUp[] = [];

  for (const draft of (drafts ?? []) as DraftRow[]) {
    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("id, thread_id, google_account_id, from_email, subject, body")
      .eq("id", draft.email_id)
      .maybeSingle();

    if (emailError || !email) {
      console.error(`Follow-up scan: email ${draft.email_id} missing`);
      continue;
    }

    const emailRow = email as EmailRow;

    if (await replyArrived(emailRow.google_account_id, emailRow.thread_id, draft.sent_at)) {
      // They replied — close this out so we never re-check it.
      await markFollowedUp(draft.id);
      continue;
    }

    eligible.push({
      draftId: draft.id,
      emailId: emailRow.id,
      sentAt: draft.sent_at,
      threadId: emailRow.thread_id,
      googleAccountId: emailRow.google_account_id,
      recipientEmail: emailRow.from_email,
      subject: emailRow.subject,
      originalBody: emailRow.body,
      sentDraftBody: draft.body,
    });
  }

  return eligible;
}
