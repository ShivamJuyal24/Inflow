// backend/src/controllers/triage.controller.ts

import { Request, Response } from "express";
import { runInboxTriage } from "../services/triage.service";
import { TriageRunResponse } from "../types/triage";

export async function runTriage(req: Request, res: Response): Promise<void> {
  try {
    const result = await runInboxTriage("manual");

    const response: TriageRunResponse = {
      message: "Inbox triage completed",
      summary: result.summary,
    };

    res.status(200).json(response);
    return;
  } catch (error: any) {
    // Already running → 409 Conflict
    if (error.message === "TRIAGE_ALREADY_RUNNING") {
      res.status(409).json({
        message: "Triage is already in progress",
      });
      return;
    }

    // Everything else → 500
    console.error("[Triage] Manual run failed:", error);
    res.status(500).json({
      message: "Triage run failed. Please try again later.",
    });
    return;
  }
}