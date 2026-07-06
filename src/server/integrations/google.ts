import { google } from "googleapis";
import type { SheetInput } from "./senders";

/**
 * Append a row to a Google Sheet via the Sheets API. Auth uses an installed
 * OAuth app + long-lived refresh token (`GOOGLE_CLIENT_ID`,
 * `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`). Only reached when senders
 * are not stubbed.
 */
function getAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      "Google not configured: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
    );
  }
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2;
}

export async function appendGoogleSheet(input: SheetInput): Promise<Record<string, unknown>> {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const range = input.sheetName ? `${input.sheetName}!A1` : "A1";
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: input.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [input.values] },
  });
  return {
    updatedRange: res.data.updates?.updatedRange,
    updatedRows: res.data.updates?.updatedRows,
  };
}
