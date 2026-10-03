import { Request, Response } from "express";
import { z } from "zod";
import { supabase } from "../config/supabase.js";
import { getMessage, sendReply } from "../services/gmail.service.js";
import type { DraftStatus } from "../types/draft.js";

type DraftRequest = Request<{ emailId: string }>;

const DRAFT_COLUMNS =
  "id, email_id, body, status, created_at, updated_at";

const EMAIL_COLUMNS =
  "id, google_account_id, thread_id, message_id, from_email, to_email, subject, body, received_at";

const MAX_DRAFT_BODY_LENGTH = 20_000;
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

type OwnedEmail = {
  id: string;
  google_account_id: string | null;
  thread_id: string;
  message_id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  received_at: string;
};

function requireUserId(req: Request, res: Response): string | null {
  if (!req.user?.id) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }

  return req.user.id;
}

async function getOwnedGoogleAccountIds(
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("google_accounts")
    .select("id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(
      `Failed to resolve owned Google accounts: ${error.message}`
    );
  }

  return (data ?? [])
    .map((account) => account.id)
    .filter(
      (id): id is string =>
        typeof id === "string" && id.length > 0
    );
}

async function getOwnedEmail(
  emailId: string,
  userId: string
): Promise<OwnedEmail | null> {
  const googleAccountIds = await getOwnedGoogleAccountIds(userId);

  if (googleAccountIds.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("emails")
    .select(EMAIL_COLUMNS)
    .eq("id", emailId)
    .in("google_account_id", googleAccountIds)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to resolve email ownership: ${error.message}`
    );
  }

  return data as OwnedEmail | null;
}

async function getOwnedDraft(
  emailId: string,
  userId: string
): Promise<{
  draft: Record<string, any>;
  email: OwnedEmail;
} | null> {
  const email = await getOwnedEmail(emailId, userId);

  if (!email) {
    return null;
  }

  const { data: draft, error } = await supabase
    .from("drafts")
    .select(DRAFT_COLUMNS)
    .eq("email_id", emailId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve draft: ${error.message}`);
  }

  return draft ? { draft, email } : null;
}

async function transitionDraft(
  emailId: string,
  userId: string,
  from: DraftStatus,
  to: DraftStatus,
  options: {
    allowStaleSending?: boolean;
    staleBefore?: string;
  } = {}
): Promise<{
  data: Record<string, any> | null;
  email: OwnedEmail | null;
}> {
  const ownedDraft = await getOwnedDraft(emailId, userId);

  if (!ownedDraft) {
    return {
      data: null,
      email: null,
    };
  }

  let query = supabase
    .from("drafts")
    .update({
      status: to,
      updated_at: new Date().toISOString(),
    })
    .eq("email_id", emailId)
    .eq("status", from);

  if (
    options.allowStaleSending &&
    from === "SENDING" &&
    options.staleBefore
  ) {
    query = query.lt("updated_at", options.staleBefore);
  }

  const { data, error } = await query
    .select(DRAFT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to transition draft: ${error.message}`);
  }

  return {
    data: data as Record<string, any> | null,
    email: ownedDraft.email,
  };
}

async function readDraftStatus(
  emailId: string,
  userId: string
): Promise<string | null> {
  const ownedDraft = await getOwnedDraft(emailId, userId);

  if (!ownedDraft) {
    return null;
  }

  return ownedDraft.draft.status ?? null;
}

function respondTransitionRefused(
  res: Response,
  status: string | null
): void {
  if (status === null) {
    res.status(404).json({ message: "Draft not found" });
    return;
  }

  res.status(409).json({
    message: `Draft cannot transition from ${status}`,
  });
}

export async function listDrafts(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = requireUserId(req, res);

    if (!userId) {
      return;
    }

    const googleAccountIds =
      await getOwnedGoogleAccountIds(userId);

    if (googleAccountIds.length === 0) {
      res.json({ drafts: [] });
      return;
    }

    const { data: emails, error: emailError } = await supabase
      .from("emails")
      .select(EMAIL_COLUMNS)
      .in("google_account_id", googleAccountIds);

    if (emailError) {
      throw new Error(
        `Failed to load owned emails: ${emailError.message}`
      );
    }

    const ownedEmails = emails ?? [];

    if (ownedEmails.length === 0) {
      res.json({ drafts: [] });
      return;
    }

    const emailIds = ownedEmails.map((email) => email.id);

    const { data: drafts, error: draftError } = await supabase
      .from("drafts")
      .select(DRAFT_COLUMNS)
      .in("email_id", emailIds);

    if (draftError) {
      throw new Error(
        `Failed to load drafts: ${draftError.message}`
      );
    }

    const emailById = new Map(
      ownedEmails.map((email) => [email.id, email])
    );

    const result = (drafts ?? []).map((draft) => ({
      ...draft,
      email: emailById.get(draft.email_id) ?? null,
    }));

    res.json({ drafts: result });
  } catch (error) {
    console.error("Failed to list drafts:", error);
    res.status(500).json({ message: "Failed to list drafts" });
  }
}

export async function getDraft(
  req: DraftRequest,
  res: Response
): Promise<void> {
  try {
    const userId = requireUserId(req, res);

    if (!userId) {
      return;
    }

    const { emailId } = req.params;

    const ownedDraft = await getOwnedDraft(emailId, userId);

    if (!ownedDraft) {
      res.status(404).json({ message: "Draft not found" });
      return;
    }

    res.json({
      ...ownedDraft.draft,
      email: ownedDraft.email,
    });
  } catch (error) {
    console.error("Failed to get draft:", error);
    res.status(500).json({ message: "Failed to get draft" });
  }
}

export async function updateDraft(
  req: DraftRequest,
  res: Response
): Promise<void> {
  try {
    const userId = requireUserId(req, res);

    if (!userId) {
      return;
    }

    const { emailId } = req.params;

    const ownedDraft = await getOwnedDraft(emailId, userId);

    if (!ownedDraft) {
      res.status(404).json({ message: "Draft not found" });
      return;
    }

    const parsed = UpdateDraftSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid request body",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { data, error } = await supabase
      .from("drafts")
      .update({
        body: parsed.data.body,
        updated_at: new Date().toISOString(),
      })
      .eq("email_id", emailId)
      .eq("status", "PENDING_REVIEW")
      .select(DRAFT_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Failed to update draft: ${error.message}`
      );
    }

    if (!data) {
      const status = await readDraftStatus(emailId, userId);
      respondTransitionRefused(res, status);
      return;
    }

    res.json(data);
  } catch (error) {
    console.error("Failed to update draft:", error);
    res.status(500).json({ message: "Failed to update draft" });
  }
}

export async function approveDraft(
  req: DraftRequest,
  res: Response
): Promise<void> {
  try {
    const userId = requireUserId(req, res);

    if (!userId) {
      return;
    }

    const { emailId } = req.params;

    const result = await transitionDraft(
      emailId,
      userId,
      "PENDING_REVIEW",
      "APPROVED"
    );

    if (!result.data) {
      const status = await readDraftStatus(emailId, userId);
      respondTransitionRefused(res, status);
      return;
    }

    res.json(result.data);
  } catch (error) {
    console.error("Failed to approve draft:", error);
    res.status(500).json({ message: "Failed to approve draft" });
  }
}

export async function rejectDraft(
  req: DraftRequest,
  res: Response
): Promise<void> {
  try {
    const userId = requireUserId(req, res);

    if (!userId) {
      return;
    }

    const { emailId } = req.params;

    const result = await transitionDraft(
      emailId,
      userId,
      "PENDING_REVIEW",
      "REJECTED"
    );

    if (!result.data) {
      const status = await readDraftStatus(emailId, userId);
      respondTransitionRefused(res, status);
      return;
    }

    res.json(result.data);
  } catch (error) {
    console.error("Failed to reject draft:", error);
    res.status(500).json({ message: "Failed to reject draft" });
  }
}

export async function sendDraft(
  req: DraftRequest,
  res: Response
): Promise<void> {
  const userId = requireUserId(req, res);

  if (!userId) {
    return;
  }

  const { emailId } = req.params;

  let ownedDraft: {
    draft: Record<string, any>;
    email: OwnedEmail;
  } | null = null;

  try {
    ownedDraft = await getOwnedDraft(emailId, userId);

    if (!ownedDraft) {
      res.status(404).json({ message: "Draft not found" });
      return;
    }

    if (!ownedDraft.email.google_account_id) {
      res.status(404).json({ message: "Google account not found" });
      return;
    }

    const { data: account, error: accountError } = await supabase
      .from("google_accounts")
      .select("id, user_id, email, refresh_token")
      .eq("id", ownedDraft.email.google_account_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (accountError) {
      throw new Error(
        `Failed to resolve Google account: ${accountError.message}`
      );
    }

    if (!account) {
      res.status(404).json({ message: "Google account not found" });
      return;
    }

    const claimed = await transitionDraft(
      emailId,
      userId,
      "APPROVED",
      "SENDING"
    );

    if (!claimed.data) {
      const status = await readDraftStatus(emailId, userId);
      respondTransitionRefused(res, status);
      return;
    }

    try {
      const message = await getMessage(
        account.refresh_token,
        ownedDraft.email.message_id
      );

      const rfcMessageId = getRfcMessageId(
        message.payload?.headers
      );

      await sendReply(account.refresh_token, {
        to: ownedDraft.email.from_email,
        from: account.email,
        subject: ownedDraft.email.subject,
        body: ownedDraft.draft.body,
        threadId: ownedDraft.email.thread_id,
        inReplyTo: rfcMessageId,
        references: rfcMessageId,
      });
    } catch (error: any) {
      const statusCode = error?.response?.status ?? error?.code;

      if (
        typeof statusCode === "number" &&
        statusCode >= 400 &&
        statusCode < 500
      ) {
        await transitionDraft(
          emailId,
          userId,
          "SENDING",
          "APPROVED"
        );

        res.status(502).json({
          message: "Gmail rejected the send request",
        });
        return;
      }

      await transitionDraft(
        emailId,
        userId,
        "SENDING",
        "SEND_UNCERTAIN"
      );

      res.status(503).json({
        message:
          "Send outcome is uncertain. Resolve the send status before retrying.",
      });
      return;
    }

    // Gmail has accepted the reply at this point. If finalizing the draft
    // fails, we must NOT fall through to the outer catch, which would release
    // the claim (SENDING -> APPROVED) and allow the reply to be sent twice.
    let sent: Awaited<ReturnType<typeof transitionDraft>>;

    try {
      sent = await transitionDraft(
        emailId,
        userId,
        "SENDING",
        "SENT"
      );
    } catch (finalizeError) {
      console.error(
        "Reply sent but failed to finalize draft:",
        finalizeError
      );

      res.status(500).json({
        message: "Reply sent but failed to update draft status",
      });
      return;
    }

    if (!sent.data) {
      res.status(503).json({
        message:
          "Reply may have been sent, but draft status could not be finalized.",
      });
      return;
    }

    res.json(sent.data);
  } catch (error) {
    console.error("Failed to send draft:", error);

    if (ownedDraft) {
      try {
        await transitionDraft(
          emailId,
          userId,
          "SENDING",
          "APPROVED"
        );
      } catch (releaseError) {
        console.error(
          "Failed to release sending claim:",
          releaseError
        );
      }
    }

    res.status(500).json({ message: "Failed to send draft" });
  }
}

export async function resolveSend(
  req: DraftRequest,
  res: Response
): Promise<void> {
  try {
    const userId = requireUserId(req, res);

    if (!userId) {
      return;
    }

    const parsed = ResolveSendSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid request body",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { emailId } = req.params;

    if (parsed.data.outcome === "SENT") {
      const result = await transitionDraft(
        emailId,
        userId,
        "SEND_UNCERTAIN",
        "SENT"
      );

      if (!result.data) {
        const status = await readDraftStatus(emailId, userId);
        respondTransitionRefused(res, status);
        return;
      }

      res.json(result.data);
      return;
    }

    const staleBefore = new Date(
      Date.now() - STALE_SENDING_MS
    ).toISOString();

    const result = await transitionDraft(
      emailId,
      userId,
      "SEND_UNCERTAIN",
      "APPROVED"
    );

    if (!result.data) {
      const staleSending = await transitionDraft(
        emailId,
        userId,
        "SENDING",
        "APPROVED",
        {
          allowStaleSending: true,
          staleBefore,
        }
      );

      if (!staleSending.data) {
        const status = await readDraftStatus(emailId, userId);
        respondTransitionRefused(res, status);
        return;
      }

      res.json(staleSending.data);
      return;
    }

    res.json(result.data);
  } catch (error) {
    console.error("Failed to resolve send:", error);
    res.status(500).json({ message: "Failed to resolve send" });
  }
}