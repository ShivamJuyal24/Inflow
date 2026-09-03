// backend/src/server.ts

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import draftRoutes from "./routes/draft.routes";
import emailRoutes from "./routes/email.routes";
import triageRoutes from "./routes/triage.routes";
import { runInboxTriage } from "./services/triage.service";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Email Triage Agent API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/emails", emailRoutes);
app.use("/api/triage", triageRoutes);

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