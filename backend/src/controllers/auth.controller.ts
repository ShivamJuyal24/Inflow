import { Request, Response } from "express";
import { oauth2Client } from "../config/google.js";
import { supabase } from "../config/supabase.js";

export const googleCallback = async (
  req: Request,
  res: Response
) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        message: "Authorization code missing",
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

    // Store refresh token in Supabase
    const { error } = await supabase
      .from("google_accounts")
      .upsert(
        {
          email,
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

