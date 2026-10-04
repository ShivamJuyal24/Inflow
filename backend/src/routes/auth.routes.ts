import { Router } from "express";

import {
  googleAuth,
  googleCallback,
  googleStatus,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/google/status", requireAuth, googleStatus);

router.get("/google", requireAuth, googleAuth);

router.get("/google/callback", googleCallback);

export default router;
