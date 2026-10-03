import { Request, Response } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase.js";
import { getMessage, sendReply } from "../services/gmail.service.js";
import type { DraftStatus } from "../types/draft.js";

type DraftRequest = Request<{ emailId: string }>;

const DRAFT_COLUMNS = "id, email_id, body, status, created_at, updated_at";

const MAX_DRAFT_BODY_LENGTH = 20_000;

/**
 * A draft left in SENDING for longer than this is assumed to belong to a
 * request that died mid-flight (crash, deploy). It can then be reconciled
 * through resolveSend. Younger SENDING drafts are never touched.
 */
const STALE_SENDING_MS = 5 * 60 * 1000;

const UpdateDraftSchema = z.object({
  body: z.string().trim().min(1).max(MAX_DRAFT_BODY_LENGTH),
});

const ResolveSendSchema = z.object({
  outcome: z.enum(["SENT", "NOT_SENT"]),
});

function getRfcMessageId(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined
): string | undefined {
  return headers
    ?.find((header) => header.name?.toLowerCase() === "message-id")
    ?.value?.trim();
}

/* =========================================================
   Atomic status transitions
   ========================================================= */

/**
 * Moves a draft from one of `from` to `to` in a single conditional UPDATE.
 * The status check and the write happen in the same statement, so when two
 * requests race only one of them matches a row; the other gets `data: null`.
 */
async function transitionDraft(
  emailId: string,
  from: DraftStatus | DraftStatus[],
  to: DraftStatus,
  options: { staleBefore?: string } = {}
) {
  let query = supabase
    .from("drafts")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("email_id", emailId);

  query = Array.isArray(from)
    ? query.in("status", from)
    : query.eq("status", from);

  if (options.staleBefore) {
    query = query.lt("updated_at", options.staleBefore);
  }

  return query.select(DRAFT_COLUMNS).maybeSingle();
}

/** Current status, used only to explain why a conditional update matched nothing. */
async function readDraftStatus(
  emailId: string
): Promise<{ status: DraftStatus | null; failed: boolean }> {
  const { data, error } = await supabase
    .from("drafts")
    .select("status")
    .eq("email_id", emailId)
    .maybeSingle();

  if (error) {
    console.error("Supabase error reading draft status:", error);
    return { status: null, failed: true };
  }

  return { status: (data?.status as DraftStatus | undefined) ?? null, failed: false };
}

async function respondTransitionRefused(
  res: Response,
  emailId: string,
  verb: "approve" | "reject" | "edit",
  pastTense: string
) {
  const { status, failed } = await readDraftStatus(emailId);

  if (failed) {
    return res.status(500).json({ message: `Failed to ${verb} draft` });
  }
  if (!status) {
    return res.status(404).json({ message: "Draft not found" });
  }
  return res.status(400).json({
    message: `Cannot ${verb} draft with status ${status}. Only PENDING_REVIEW drafts can be ${pastTense}.`,
  });
}

/* =========================================================
   Read endpoints
   ========================================================= */

export const listDrafts = async (_req: Request, res: Response) => {
  try {
    const { data: drafts, error: draftsError } = await supabase
      .from("drafts")
      .select("id, email_id, body, status, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (draftsError) {
      console.error("Supabase error listing drafts:", draftsError);
      return res.status(500).json({ message: "Failed to fetch drafts" });
    }

    if (!drafts || drafts.length === 0) {
      return res.json({ drafts: [] });
    }

    const emailIds = drafts.map((d) => d.email_id);
    const { data: emails, error: emailsError } = await supabase
      .from("emails")
      .select("id, message_id, from_email, subject, received_at")
      .in("id", emailIds);

    if (emailsError) {
      console.error("Supabase error fetching emails:", emailsError);
      return res.status(500).json({ message: "Failed to fetch emails" });
    }

    const emailMap = new Map(emails?.map((e) => [e.id, e]) ?? []);

    const enrichedDrafts = drafts.map((draft) => ({
      ...draft,
      email: emailMap.get(draft.email_id) ?? null,
    }));

    return res.json({ drafts: enrichedDrafts });
  } catch (error) {
    console.error("List drafts error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getDraft = async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;

    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select("id, email_id, body, status, created_at, updated_at")
      .eq("email_id", emailId)
      .single();

    if (draftError) {
      console.error("Supabase error fetching draft:", draftError);
      if (draftError.code === "PGRST116") {
        return res.status(404).json({ message: "Draft not found" });
      }
      return res.status(500).json({ message: "Failed to fetch draft" });
    }

    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("id, message_id, from_email, to_email, subject, body, received_at")
      .eq("id", draft.email_id)
      .single();

    if (emailError) {
      console.error("Supabase error fetching email:", emailError);
      return res.status(500).json({ message: "Failed to fetch email" });
    }

    return res.json({ draft: { ...draft, email } });
  } catch (error) {
    console.error("Get draft error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   Review: edit / approve / reject
   ========================================================= */

/**
 * Edit the reply text. Only allowed while the draft is PENDING_REVIEW, and
 * enforced in the UPDATE itself so an edit cannot land after approval has
 * started (which would change what gets sent after it was approved).
 */
export const updateDraft = async (req: DraftRequest, res: Response) => {
  try {
    const { emailId } = req.params;

    const parsed = UpdateDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: `Draft body must be a non-empty string of at most ${MAX_DRAFT_BODY_LENGTH} characters`,
      });
    }

    const { data, error } = await supabase
      .from("drafts")
      .update({ body: parsed.data.body, updated_at: new Date().toISOString() })
      .eq("email_id", emailId)
      .eq("status", "PENDING_REVIEW")
      .select(DRAFT_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error("Supabase error updating draft:", error);
      return res.status(500).json({ message: "Failed to update draft" });
    }

    if (!data) {
      return respondTransitionRefused(res, emailId, "edit", "edited");
    }

    return res.status(200).json({ message: "Draft updated", draft: data });
  } catch (error) {
    console.error("Update draft error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const approveDraft = async (req: DraftRequest, res: Response) => {
  try {
    const { emailId } = req.params;

    const { data, error } = await transitionDraft(
      emailId,
      "PENDING_REVIEW",
      "APPROVED"
    );

    if (error) {
      console.error("Supabase error approving draft:", error);
      return res.status(500).json({ message: "Failed to approve draft" });
    }

    if (!data) {
      return respondTransitionRefused(res, emailId, "approve", "approved");
    }

    return res.status(200).json({ message: "Draft approved", draft: data });
  } catch (error) {
    console.error("Approve draft error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const rejectDraft = async (req: DraftRequest, res: Response) => {
  try {
    const { emailId } = req.params;

    const { data, error } = await transitionDraft(
      emailId,
      "PENDING_REVIEW",
      "REJECTED"
    );

    if (error) {
      console.error("Supabase error rejecting draft:", error);
      return res.status(500).json({ message: "Failed to reject draft" });
    }

    if (!data) {
      return respondTransitionRefused(res, emailId, "reject", "rejected");
    }

    return res.json({ message: "Draft rejected", draft: data });
  } catch (error) {
    console.error("Reject draft error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =========================================================
   Send
   ========================================================= */

class SendSetupError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * True only when Gmail (or the network) definitely refused the request, so
 * the message cannot have been sent and releasing the draft is safe.
 * Anything else (5xx, timeouts, dropped connections, unknown errors) might
 * have been accepted by Gmail before the failure, so it is treated as
 * uncertain and never retried automatically.
 */
function isDefinitiveSendRejection(error: unknown): boolean {
  const e = error as any;

  const numericCode =
    typeof e?.code === "number"
      ? e.code
      : typeof e?.code === "string" && /^\d{3}$/.test(e.code)
        ? Number(e.code)
        : undefined;

  const status = e?.response?.status ?? e?.status ?? numericCode;

  if (typeof status === "number") {
    return status >= 400 && status < 500 && status !== 408;
  }

  // The connection was never established, so nothing reached Gmail.
  return ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN"].includes(e?.code);
}

async function respondSendRefused(res: Response, emailId: string) {
  const { status, failed } = await readDraftStatus(emailId);

  if (failed) {
    return res.status(500).json({ message: "Failed to send reply" });
  }
  if (!status) {
    return res.status(404).json({ message: "Draft not found" });
  }
  if (status === "SENT") {
    return res.status(400).json({ message: "Draft already sent" });
  }
  if (status === "SENDING") {
    return res.status(409).json({ message: "Draft is already being sent" });
  }
  if (status === "SEND_UNCERTAIN") {
    return res.status(409).json({
      message:
        "A previous send attempt could not be confirmed. Check your Sent folder, then mark the draft as sent or not sent.",
    });
  }

  // Approval gate: sending is only allowed once a draft has been explicitly approved.
  return res.status(400).json({
    message: `Cannot send draft with status ${status}. Draft must be APPROVED first.`,
  });
}

/** Put a claimed draft back to APPROVED. Only used when nothing was sent. */
async function releaseClaim(emailId: string) {
  try {
    const { error } = await transitionDraft(emailId, "SENDING", "APPROVED");
    if (error) {
      console.error("Failed to release send claim:", error);
    }
  } catch (error) {
    console.error("Failed to release send claim:", error);
  }
}

export const sendDraft = async (req: DraftRequest, res: Response) => {
  const { emailId } = req.params;

  try {
    // 1. Claim the draft: APPROVED -> SENDING in one conditional UPDATE.
    // Exactly one concurrent request can win; the rest are refused below.
    const { data: draft, error: claimError } = await transitionDraft(
      emailId,
      "APPROVED",
      "SENDING"
    );

    if (claimError) {
      console.error("Supabase error claiming draft:", claimError);
      return res.status(500).json({ message: "Failed to send reply" });
    }

    if (!draft) {
      return respondSendRefused(res, emailId);
    }

    // From here on this request owns the draft. The body to send is the one
    // returned by the claim itself, i.e. exactly what was approved.

    // 2. Everything needed to send. A failure here means nothing was sent,
    // so the claim is released and the draft can be retried.
    let email: {
      thread_id: string;
      message_id: string;
      from_email: string;
      subject: string;
    };
    let account: { email: string; refresh_token: string };
    let rfcMessageId: string | undefined;

    try {
      const { data: emailRow, error: emailError } = await supabase
        .from("emails")
        .select("id, thread_id, message_id, from_email, to_email, subject")
        .eq("id", draft.email_id)
        .single();

      if (emailError || !emailRow) {
        console.error("Supabase error fetching email:", emailError);
        throw new SendSetupError(404, "Original email not found");
      }
      email = emailRow;

      const { data: accountRow, error: accountError } = await supabase
        .from("google_accounts")
        .select("email, refresh_token")
        .limit(1)
        .single();

      if (accountError || !accountRow) {
        console.error("Supabase error fetching account:", accountError);
        throw new SendSetupError(500, "Google account not configured");
      }
      account = accountRow;

      // RFC Message-ID of the original, for threading.
      const originalMessage = await getMessage(
        account.refresh_token,
        email.message_id
      );
      rfcMessageId = getRfcMessageId(originalMessage.payload?.headers);
    } catch (setupError) {
      await releaseClaim(emailId);

      if (setupError instanceof SendSetupError) {
        return res
          .status(setupError.httpStatus)
          .json({ message: setupError.message });
      }
      console.error("Send draft setup error:", setupError);
      return res.status(500).json({ message: "Failed to send reply" });
    }

    // 3. Send. Never retried automatically after an uncertain failure.
    try {
      await sendReply(account.refresh_token, {
        to: email.from_email,
        from: account.email,
        subject: email.subject,
        body: draft.body,
        threadId: email.thread_id,
        inReplyTo: rfcMessageId,
        references: rfcMessageId,
      });
    } catch (sendError) {
      if (isDefinitiveSendRejection(sendError)) {
        console.error("Gmail rejected the reply:", sendError);
        await releaseClaim(emailId);
        return res.status(500).json({ message: "Failed to send reply" });
      }

      console.error("Gmail send outcome uncertain:", sendError);
      let uncertainDraft = null;
      try {
        const { data } = await transitionDraft(
          emailId,
          "SENDING",
          "SEND_UNCERTAIN"
        );
        uncertainDraft = data;
      } catch (markError) {
        console.error("Failed to mark draft SEND_UNCERTAIN:", markError);
      }

      return res.status(502).json({
        message:
          "Gmail did not confirm the send. Check your Sent folder before trying again.",
        draft: uncertainDraft,
      });
    }

    // 4. Record the outcome. The reply is already out, so a failure here is
    // reported as such and the draft stays SENDING (never re-sendable).
    try {
      const { data: sentDraft, error: sentError } = await transitionDraft(
        emailId,
        "SENDING",
        "SENT"
      );

      if (sentError || !sentDraft) {
        console.error("Supabase error marking draft SENT:", sentError);
        return res
          .status(500)
          .json({ message: "Reply sent but failed to update draft status" });
      }

      return res
        .status(200)
        .json({ message: "Reply sent successfully", draft: sentDraft });
    } catch (markError) {
      console.error("Supabase error marking draft SENT:", markError);
      return res
        .status(500)
        .json({ message: "Reply sent but failed to update draft status" });
    }
  } catch (error) {
    // Only reachable before the claim succeeded (or if the claim query threw),
    // so nothing has been sent.
    console.error("Send draft error:", error);
    return res.status(500).json({ message: "Failed to send reply" });
  }
};

/**
 * Human reconciliation after an uncertain send: the user checks their Sent
 * folder and reports what actually happened.
 *   outcome SENT      -> draft becomes SENT
 *   outcome NOT_SENT  -> draft returns to APPROVED so it can be sent again
 * Also accepts a SENDING draft that has been stuck past STALE_SENDING_MS.
 */
export const resolveSend = async (req: DraftRequest, res: Response) => {
  try {
    const { emailId } = req.params;

    const parsed = ResolveSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: 'outcome must be "SENT" or "NOT_SENT"' });
    }

    const target: DraftStatus =
      parsed.data.outcome === "SENT" ? "SENT" : "APPROVED";

    let result = await transitionDraft(emailId, "SEND_UNCERTAIN", target);

    if (!result.error && !result.data) {
      result = await transitionDraft(emailId, "SENDING", target, {
        staleBefore: new Date(Date.now() - STALE_SENDING_MS).toISOString(),
      });
    }

    if (result.error) {
      console.error("Supabase error resolving send:", result.error);
      return res.status(500).json({ message: "Failed to resolve send" });
    }

    if (!result.data) {
      const { status, failed } = await readDraftStatus(emailId);

      if (failed) {
        return res.status(500).json({ message: "Failed to resolve send" });
      }
      if (!status) {
        return res.status(404).json({ message: "Draft not found" });
      }
      return res.status(400).json({
        message: `Cannot resolve send for draft with status ${status}. Only SEND_UNCERTAIN drafts (or SENDING drafts stuck for over ${STALE_SENDING_MS / 60000} minutes) can be resolved.`,
      });
    }

    return res.status(200).json({
      message:
        parsed.data.outcome === "SENT"
          ? "Draft marked as sent"
          : "Draft returned to APPROVED; it can be sent again",
      draft: result.data,
    });
  } catch (error) {
    console.error("Resolve send error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
