import { Router } from "express";

import {
  googleAuth,
  googleCallback,
  testGoogleRefresh,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/google", requireAuth, googleAuth);

router.get("/google/callback", googleCallback);

router.get("/google/test-refresh", testGoogleRefresh);

export default router;

