import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

const GOOGLE_CLIENT_ID =
  process.env.Google_Client_id || process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET =
  process.env.Google_client_secret || process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI =
  process.env.Google_Redirect_Uri ||
  process.env.GOOGLE_REDIRECT_URI ||
  "postmessage";

export const oauth2client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);
