import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import draftRoutes from "./routes/draft.routes.js";
import emailRoutes from "./routes/email.routes.js";
import triageRoutes from "./routes/triage.routes.js";

export function createApp() {
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

  return app;
}