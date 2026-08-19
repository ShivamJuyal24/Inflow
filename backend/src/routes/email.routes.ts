import { Router } from "express";
import {
  listEmails,
  getEmail,
  syncEmails,
} from "../controllers/email.controller.js";

const router = Router();

router.get("/", listEmails);
router.get("/:id", getEmail);
router.post("/sync", syncEmails);

export default router;