/**
 * Scheduled-trigger config. A friendly, UI-buildable spec (no raw cron typing)
 * that we translate to a cron expression for evaluation.
 *
 * This module is intentionally dependency-free (client-safe): the builder UI and
 * unit tests import it. Due-detection lives in `schedule-due.ts` (server-only,
 * pulls in cron-parser) so cron-parser never reaches the client bundle.
 */
export type Frequency = "hourly" | "daily" | "weekly" | "monthly";

export interface Schedule {
  frequency: Frequency;
  minute?: number; // 0–59
  hour?: number; // 0–23 (daily / weekly / monthly)
  weekday?: number; // 0–6, Sun–Sat (weekly)
  day?: number; // 1–28 (monthly; capped so it fires every month)
  timezone?: string; // IANA tz, defaults to UTC
}

function clampInt(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

/** Translate a friendly schedule into a 5-field cron expression. */
export function cronFromSchedule(s: Schedule): string {
  const m = clampInt(s.minute, 0, 59, 0);
  const h = clampInt(s.hour, 0, 23, 9);
  switch (s.frequency) {
    case "hourly": return `${m} * * * *`;
    case "weekly": return `${m} ${h} * * ${clampInt(s.weekday, 0, 6, 1)}`;
    case "monthly": return `${m} ${h} ${clampInt(s.day, 1, 28, 1)} * *`;
    case "daily":
    default: return `${m} ${h} * * *`;
  }
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Human-readable summary, e.g. "Every weekday" → "Every Monday at 09:00". */
export function describeSchedule(s: Schedule): string {
  const m = clampInt(s.minute, 0, 59, 0);
  const at = `${pad(clampInt(s.hour, 0, 23, 9))}:${pad(m)}`;
  switch (s.frequency) {
    case "hourly": return `Every hour at :${pad(m)}`;
    case "weekly": return `Every ${DOW[clampInt(s.weekday, 0, 6, 1)]} at ${at}`;
    case "monthly": return `On day ${clampInt(s.day, 1, 28, 1)} of each month at ${at}`;
    case "daily":
    default: return `Every day at ${at}`;
  }
}
