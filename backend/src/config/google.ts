import dotenv from "dotenv";
import { google } from "googleapis";

dotenv.config();
// console.log("Client ID:", process.env.GOOGLE_CLIENT_ID);
// console.log("Redirect URI:", process.env.GOOGLE_REDIRECT_URI);
export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);