import { Request, Response } from "express";
import { runInboxTriage } from "../services/triage.service";
import { TriageRunResponse } from "../types/triage";

export async function runTriage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({
        message: "Authentication required",
      });
      return;
    }

    const result = await runInboxTriage("manual", req.user.id);

    const response: TriageRunResponse = {
      message: "Inbox triage completed",
      summary: result.summary,
    };

    res.status(200).json(response);
    return;
  } catch (error: any) {
    if (error.message === "TRIAGE_ALREADY_RUNNING") {
      res.status(409).json({
        message: "Triage is already in progress",
      });
      return;
    }

    console.error("[Triage] Manual run failed:", error);

    res.status(500).json({
      message: "Triage run failed. Please try again later.",
    });
    return;
  }
}