
import { Router } from "express";

import {
  listEmails,
  getEmail,
  syncEmails,
} from "../controllers/email.controller.js";

import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, listEmails);

router.get("/:id", requireAuth, getEmail);

router.post("/sync", requireAuth, syncEmails);

export default router;

