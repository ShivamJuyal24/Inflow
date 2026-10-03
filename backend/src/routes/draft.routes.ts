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

const router = Router();

router.get("/", listDrafts);
router.get("/:emailId", getDraft);
router.patch("/:emailId", updateDraft);
router.post("/:emailId/approve", approveDraft);
router.post("/:emailId/reject", rejectDraft);
router.post("/:emailId/send", sendDraft);
router.post("/:emailId/resolve-send", resolveSend);

export default router;
