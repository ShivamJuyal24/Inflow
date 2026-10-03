import { Router } from "express";

import { runTriage } from "../controllers/triage.controller";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// POST /api/triage/run
router.post("/run", requireAuth, runTriage);

export default router;