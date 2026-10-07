// backend/src/server.ts

import dotenv from "dotenv";
import { createApp } from "./app.js";
import { runInboxTriage } from "./services/triage.service.js";
import { runFollowUpSweep } from "./services/followUp.service.js";

dotenv.config();

const app = createApp();

const PORT = process.env.PORT || 5000;

// ── Auto-triage: run full LangGraph pipeline on a schedule ──
// Default: every 5 minutes. Override with SYNC_INTERVAL_MS in .env
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 5 * 60 * 1000;

// Follow-up sweeps are not time-critical; hourly is plenty given that
// the trigger delay is measured in days. Override with FOLLOWUP_INTERVAL_MS.
const FOLLOWUP_INTERVAL_MS =
  Number(process.env.FOLLOWUP_INTERVAL_MS) || 60 * 60 * 1000;

async function runFollowUpSweepSafe() {
  try {
    await runFollowUpSweep();
  } catch (error: any) {
    // Never crash the server because of a failed sweep
    console.error("Follow-up sweep failed:", error);
  }
}

async function runAutoTriage() {
  try {
    await runInboxTriage("scheduled");
  } catch (error: any) {
    // Never crash the server because of a failed triage
    if (error.message === "TRIAGE_ALREADY_RUNNING") {
      console.log("Auto-triage skipped: already in progress");
    } else {
      console.error("Auto-triage failed:", error);
    }
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Run full triage once on startup, then on the interval
  runInboxTriage("startup").catch((err) => {
    if (err.message !== "TRIAGE_ALREADY_RUNNING") {
      console.error("Startup triage failed:", err);
    }
  });

  setInterval(runAutoTriage, SYNC_INTERVAL_MS);
  console.log(`Auto-triage enabled: every ${SYNC_INTERVAL_MS / 1000}s`);

  setInterval(runFollowUpSweepSafe, FOLLOWUP_INTERVAL_MS);
  console.log(
    `Follow-up sweeps enabled: every ${FOLLOWUP_INTERVAL_MS / 1000}s`
  );
});