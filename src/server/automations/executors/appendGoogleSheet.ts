import type { Executor } from "./index";

export const appendGoogleSheet: Executor = async (input, ctx) => {
  const spreadsheetId = String(input.spreadsheetId ?? "").trim();
  if (!spreadsheetId) throw new Error("appendGoogleSheet: 'spreadsheetId' is required");
  const values = Array.isArray(input.values) ? input.values.map((v) => String(v ?? "")) : [];
  return ctx.senders.appendGoogleSheet({
    spreadsheetId,
    sheetName: input.sheetName ? String(input.sheetName) : undefined,
    values,
  });
};
