// backend/src/controllers/email.controller.ts

import { Request, Response } from "express";
import { supabase } from "../config/supabase.js";
import { runInboxTriage } from "../services/triage.service.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const listEmails = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT)
    );

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Optional filters: ?category=IMPORTANT&q=invoice
    const category = req.query.category as string | undefined;
    const search = req.query.q as string | undefined;

    let query = supabase
      .from("emails")
      .select(
        "id, message_id, thread_id, from_email, to_email, subject, category, classification_reason, suggested_action, received_at",
        { count: "exact" }
      )
      .order("received_at", { ascending: false })
      .range(from, to);

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(
        `subject.ilike.%${search}%,from_email.ilike.%${search}%`
      );
    }

    const { data: emails, error, count } = await query;

    if (error) {
      console.error("Supabase error listing emails:", error);
      return res.status(500).json({ message: "Failed to fetch emails" });
    }

    return res.json({
      emails: emails ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error("List emails error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getEmail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: email, error } = await supabase
      .from("emails")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ message: "Email not found" });
      }
      console.error("Supabase error fetching email:", error);
      return res.status(500).json({ message: "Failed to fetch email" });
    }

    return res.json({ email });
  } catch (error) {
    console.error("Get email error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Manual trigger: POST /api/emails/sync
// Now runs the FULL triage pipeline (same as scheduled + POST /api/triage/run)
export const syncEmails = async (_req: Request, res: Response) => {
  try {
    const result = await runInboxTriage("manual");

    return res.json({
      message: "Triage complete",
      summary: result.summary,
    });
  } catch (error: any) {
    if (error.message === "TRIAGE_ALREADY_RUNNING") {
      return res.status(409).json({
        message: "Triage is already in progress",
      });
    }

    console.error("Sync emails error:", error);
    return res.status(500).json({ message: "Failed to run triage" });
  }
};