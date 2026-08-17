import { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { getMessage, sendReply } from "../services/gmail.service.js";

function getRfcMessageId(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined
): string | undefined {
  return headers
    ?.find((header) => header.name?.toLowerCase() === "message-id")
    ?.value?.trim();
}

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

export const approveDraft = async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;

    const { data, error } = await supabase
      .from("drafts")
      .update({ status: "APPROVED", updated_at: new Date().toISOString() })
      .eq("email_id", emailId)
      .select("id, email_id, body, status, created_at, updated_at")
      .single();

    if (error) {
      console.error("Supabase error approving draft:", error);
      if (error.code === "PGRST116") {
        return res.status(404).json({ message: "Draft not found" });
      }
      return res.status(500).json({ message: "Failed to approve draft" });
    }

    return res.json({ message: "Draft approved", draft: data });
  } catch (error) {
    console.error("Approve draft error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const rejectDraft = async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;

    const { data, error } = await supabase
      .from("drafts")
      .update({ status: "REJECTED", updated_at: new Date().toISOString() })
      .eq("email_id", emailId)
      .select("id, email_id, body, status, created_at, updated_at")
      .single();

    if (error) {
      console.error("Supabase error rejecting draft:", error);
      if (error.code === "PGRST116") {
        return res.status(404).json({ message: "Draft not found" });
      }
      return res.status(500).json({ message: "Failed to reject draft" });
    }

    return res.json({ message: "Draft rejected", draft: data });
  } catch (error) {
    console.error("Reject draft error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const sendDraft = async (req: Request, res: Response) => {
  try {
    const { emailId } = req.params;

    // 1. Fetch the draft
    const { data: draft, error: draftError } = await supabase
      .from("drafts")
      .select("id, email_id, body, status")
      .eq("email_id", emailId)
      .single();

    if (draftError || !draft) {
      console.error("Supabase error fetching draft:", draftError);
      return res.status(404).json({ message: "Draft not found" });
    }

    if (draft.status === "SENT") {
      return res.status(400).json({ message: "Draft already sent" });
    }

    // 2. Fetch the original email (need thread_id and sender info)
    const { data: email, error: emailError } = await supabase
      .from("emails")
      .select("id, thread_id, message_id, from_email, to_email, subject")
      .eq("id", draft.email_id)
      .single();

    if (emailError || !email) {
      console.error("Supabase error fetching email:", emailError);
      return res.status(404).json({ message: "Original email not found" });
    }

    // 3. Get Google account refresh token
    const { data: account, error: accountError } = await supabase
      .from("google_accounts")
      .select("email, refresh_token")
      .limit(1)
      .single();

    if (accountError || !account) {
      console.error("Supabase error fetching account:", accountError);
      return res.status(500).json({ message: "Google account not configured" });
    }

    // 4. Fetch RFC Message-ID from the original Gmail message for threading
    const originalMessage = await getMessage(
      account.refresh_token,
      email.message_id
    );
    const rfcMessageId = getRfcMessageId(originalMessage.payload?.headers);

    // 5. Send the reply via Gmail API
    await sendReply(account.refresh_token, {
      to: email.from_email,
      from: account.email,
      subject: email.subject,
      body: draft.body,
      threadId: email.thread_id,
      inReplyTo: rfcMessageId,
      references: rfcMessageId,
    });

    // 6. Mark draft as SENT
    const { data: updatedDraft, error: updateError } = await supabase
      .from("drafts")
      .update({ status: "SENT", updated_at: new Date().toISOString() })
      .eq("email_id", emailId)
      .select("id, email_id, body, status, created_at, updated_at")
      .single();

    if (updateError) {
      console.error("Supabase error updating draft:", updateError);
      return res.status(500).json({ message: "Reply sent but failed to update draft status" });
    }

    return res.json({ message: "Reply sent successfully", draft: updatedDraft });
  } catch (error) {
    console.error("Send draft error:", error);
    return res.status(500).json({ message: "Failed to send reply" });
  }
};