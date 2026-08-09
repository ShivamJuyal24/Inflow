import { Router } from "express";
import { oauth2Client } from "../config/google.js";
import { GOOGLE_SCOPES } from "../config/googleScopes.js";
import { googleCallback, testGoogleRefresh } from "../controllers/auth.controller.js";

const router = Router();

router.get("/google", (_req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SCOPES,
    prompt: "consent"
  });

  res.redirect(authUrl);
});

router.get("/google/callback", googleCallback);
router.get("/google/test-refresh", testGoogleRefresh);
export default router;