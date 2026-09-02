import { Router } from "express";
import { runTriage } from "../controllers/triage.controller";

const router = Router();

//POST /api/triage/run
router.post('/run', runTriage);

export default router;