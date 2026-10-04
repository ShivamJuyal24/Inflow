import crypto from "node:crypto";
import { Request, Response } from "express";
import { oauth2Client } from "../config/google.js";
import { GOOGLE_SCOPES } from "../config/googleScopes.js";
import { supabase } from "../config/supabase.js";

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  userId: string;
  issuedAt: number;
};

function getOAuthStateSecret(): string {
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!secret) {
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }

  return secret;
}

function signOAuthState(payload: OAuthStatePayload): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );

  const signature = crypto
    .createHmac("sha256", getOAuthStateSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifyOAuthState(state: string): OAuthStatePayload | null {
  const [encodedPayload, signature] = state.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac("sha256", getOAuthStateSecret())
    .update(encodedPayload)
    .digest("base64url");

  const providedSignature = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    providedSignature.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as OAuthStatePayload;

    if (
      typeof payload.userId !== "string" ||
      typeof payload.issuedAt !== "number"
    ) {
      return null;
    }

    if (Date.now() - payload.issuedAt > OAUTH_STATE_MAX_AGE_MS) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export const googleAuth = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const state = signOAuthState({
      userId: req.user.id,
      issuedAt: Date.now(),
    });

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GOOGLE_SCOPES,
      prompt: "consent",
      state,
    });

    return res.redirect(authUrl);
  } catch (error) {
    console.error("Google OAuth initiation error:", error);

    return res.status(500).json({
      message: "Failed to start Google OAuth",
    });
  }
};

export const googleCallback = async (
  req: Request,
  res: Response
) => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        message: "Authorization code missing",
      });
    }

    if (!state || typeof state !== "string") {
      return res.status(400).json({
        message: "OAuth state missing",
      });
    }

    const statePayload = verifyOAuthState(state);

    if (!statePayload) {
      return res.status(400).json({
        message: "Invalid or expired OAuth state",
      });
    }

    // Exchange authorization code for Google tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log("Token received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope,
      expiryDate: tokens.expiry_date,
    });

    // Make the tokens available to the OAuth client
    oauth2Client.setCredentials(tokens);

    // Make sure we received an access token
    const accessToken = tokens.access_token;

    if (!accessToken) {
      return res.status(400).json({
        message: "Access token not received from Google",
      });
    }

    // Get Google account information
    const response = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();

      console.error("Google userinfo error:", errorData);

      return res.status(500).json({
        message: "Failed to fetch Google user info",
      });
    }

    const data = await response.json();
    const email = data.email;

    console.log("Google email:", email);

    if (!email) {
      return res.status(400).json({
        message: "Email not found",
      });
    }

    // Make sure we received a refresh token
    if (!tokens.refresh_token) {
      return res.status(400).json({
        message: "Refresh token not found",
      });
    }

    // Verify that an existing Google account is either owned by this user
    // or does not exist yet. Never transfer an existing account to another user.
    const { data: existingAccount, error: ownershipLookupError } =
      await supabase
        .from("google_accounts")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();

    if (ownershipLookupError) {
      console.error(
        "Supabase ownership lookup error:",
        ownershipLookupError
      );

      return res.status(500).json({
        message: "Failed to verify Google account ownership",
      });
    }

    if (existingAccount && existingAccount.user_id !== statePayload.userId) {
      return res.status(403).json({
        message: "Google account is already connected to another user",
      });
    }

    // Store the Google account and associate it with
    // the authenticated Supabase user from the signed OAuth state.
    const { error } = await supabase
      .from("google_accounts")
      .upsert(
        {
          email,
          user_id: statePayload.userId,
          refresh_token: tokens.refresh_token,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "email",
        }
      );

    if (error) {
      console.error("Supabase error:", error);

      return res.status(500).json({
        message: "Failed to save Google account",
      });
    }

    return res.json({
      message: "Google OAuth successful",
      email,
      refreshTokenStored: true,
    });
  } catch (error) {
    console.error("Google OAuth error:", error);

    return res.status(500).json({
      message: "OAuth failed",
    });
  }
};

export const testGoogleRefresh = async (
  _req: Request,
  res: Response
) => {
  try {
    // Get the stored Google account
    const { data: account, error } = await supabase
      .from("google_accounts")
      .select("email, refresh_token")
      .eq("email", "shivamjuyal.dev@gmail.com")
      .single();

    if (error || !account) {
      console.error("Supabase error:", error);

      return res.status(404).json({
        message: "Google account not found",
      });
    }

    // Give the refresh token to Google's OAuth client
    oauth2Client.setCredentials({
      refresh_token: account.refresh_token,
    });

    // Ask Google for a fresh access token
    const { credentials } =
      await oauth2Client.refreshAccessToken();

    console.log("Refresh successful:", {
      hasAccessToken: !!credentials.access_token,
      expiryDate: credentials.expiry_date,
    });

    return res.json({
      message: "Token refresh successful",
      hasAccessToken: !!credentials.access_token,
    });
  } catch (error) {
    console.error("Token refresh error:", error);

    return res.status(500).json({
      message: "Token refresh failed",
    });
  }
};
