import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import draftRoutes from "./routes/draft.routes";
import emailRoutes from "./routes/email.routes";
import { syncRecentEmails } from "./services/emailSync.service";
import triageRoutes from "./routes/triage.routes";
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

// ── Auto-sync: fetch new Gmail emails on its own ──
// Default: every 5 minutes. Override with SYNC_INTERVAL_MS in .env
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 5 * 60 * 1000;

async function runAutoSync() {
  try {
    await syncRecentEmails(20);
  } catch (error) {
    // Never crash the server because of a failed sync
    console.error("Auto-sync failed:", error);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  // Sync once on startup, then on the interval
  runAutoSync();
  setInterval(runAutoSync, SYNC_INTERVAL_MS);
  console.log(`Auto-sync enabled: every ${SYNC_INTERVAL_MS / 1000}s`);
});