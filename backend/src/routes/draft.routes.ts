import { Router } from "express";

import {
  listDrafts,
  getDraft,
  updateDraft,
  approveDraft,
  rejectDraft,
  sendDraft,
  resolveSend,
} from "../controllers/draft.controller.js";

import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", requireAuth, listDrafts);
router.get("/:emailId", requireAuth, getDraft);
router.patch("/:emailId", requireAuth, updateDraft);
router.post("/:emailId/approve", requireAuth, approveDraft);
router.post("/:emailId/reject", requireAuth, rejectDraft);
router.post("/:emailId/send", requireAuth, sendDraft);
router.post("/:emailId/resolve-send", requireAuth, resolveSend);

export default router;