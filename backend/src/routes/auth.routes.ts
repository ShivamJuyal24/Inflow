import { Router } from "express";

import {
  googleAuth,
  googleCallback,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/google", requireAuth, googleAuth);

router.get("/google/callback", googleCallback);

export default router;
