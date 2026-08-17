import { Router } from "express";
import {
  listDrafts,
  getDraft,
  approveDraft,
  rejectDraft,
  sendDraft,
} from "../controllers/draft.controller.js";

const router = Router();

router.get("/", listDrafts);
router.get("/:emailId", getDraft);
router.post("/:emailId/approve", approveDraft);
router.post("/:emailId/reject", rejectDraft);
router.post("/:emailId/send", sendDraft);

export default router;