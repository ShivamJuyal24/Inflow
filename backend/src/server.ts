// backend/src/server.ts

import dotenv from "dotenv";
import { createApp } from "./app.js";
import { runInboxTriage } from "./services/triage.service.js";

dotenv.config();

const app = createApp();

const PORT = process.env.PORT || 5000;

// ── Auto-triage: run full LangGraph pipeline on a schedule ──
// Default: every 5 minutes. Override with SYNC_INTERVAL_MS in .env
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 5 * 60 * 1000;

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
});