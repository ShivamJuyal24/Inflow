import { Request, Response } from "express";
import { TriageRunResponse, TriageSummary } from "../types/triage";

import { graph } from '../graph/graph';
import { EmailTriageState } from "../graph/state";

const INITIAL_STATE: EmailTriageState = {
    emails:[],
    classification:[],
    actions:[],
    drafts:[],
    calendarSlots:[],
    approvalStatus: "PENDING",
};

export async function runTriage(req: Request, res: Response): Promise<void> {
    console.log('[Triage] Run started');
  
    try {
      // 2. Invoke the compiled graph with the empty state
      const finalState = await graph.invoke(INITIAL_STATE);
  
      // 3. Count classifications, actions by type, and newly returned drafts
      const summary: TriageSummary = {
        emailsFetched: finalState.emails?.length ?? 0,
        emailsClassified: finalState.classification?.length ?? 0,
        actionsCreated: finalState.actions?.length ?? 0,
      
        draftsCreated: finalState.drafts?.length ?? 0,
      
        draftsPendingReview:
          finalState.drafts?.filter(
            (d) => d.status === "PENDING_REVIEW"
          ).length ?? 0,
      
        meetingActions:
          finalState.actions?.filter(
            (a) => a.type === "ANALYZE_MEETING"
          ).length ?? 0,
      };
  
      // 4. Prepare the response
      const response: TriageRunResponse = {
        message:"Inbox triage completed",
        summary: summary,
      };

      // 5. Return 200 with the summary
      console.log('[Triage] Run completed:', summary);
      res.status(200).json(response);
      return;
  
    } catch (error) {
      // 6. Log the error and return a generic 500
      console.error('[Triage] Run failed:', error);
      res.status(500).json({
        message: 'Triage run failed. Please try again later.',
      });
      return;
    }
  }