import { CronExpressionParser } from "cron-parser";
import { cronFromSchedule, type Schedule } from "./schedule";

/**
 * Is the automation due to run now? True when the first cron occurrence strictly
 * after `since` is at or before `now`. `since` = the last scheduled run (or the
 * automation's creation time before it has ever run). Firing advances `since`,
 * so a caught-up worker fires each occurrence exactly once (occurrences missed
 * while the worker was down collapse into a single catch-up run).
 *
 * Server-only: pulls in cron-parser (keep out of the client bundle).
 */
export function scheduleIsDue(s: Schedule, since: Date, now: Date): boolean {
  try {
    const it = CronExpressionParser.parse(cronFromSchedule(s), {
      currentDate: since,
      tz: s.timezone || "UTC",
    });
    return it.next().toDate().getTime() <= now.getTime();
  } catch {
    return false;
  }
}
