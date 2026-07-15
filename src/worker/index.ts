import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { automations, fields as fieldsTable } from "@/server/db/schema";
import type { FieldDTO, FilterCondition } from "@/lib/types";
import { evaluateRecordCondition } from "@/lib/query";
import { makeRecordContext } from "@/lib/value-resolver";
import { enrichRecords } from "@/server/services/links";
import { getConnection, AUTOMATION_QUEUE_NAME } from "@/server/automations/queue";
import { MAX_AUTOMATION_DEPTH } from "@/server/automations/context";
import { runAutomation } from "@/server/automations/run";
import { scheduleIsDue } from "@/server/automations/schedule-due";
import type { Schedule } from "@/server/automations/schedule";
import type { ChangeEvent } from "@/server/automations/emit";

type AutomationRow = typeof automations.$inferSelect;

/** Evaluate a condition set (`FilterCondition[]`) against a record's cells. */
function evalConditions(
  conjunction: string,
  conditions: FilterCondition[],
  fieldsById: Map<string, FieldDTO>,
  cells: Record<string, unknown>
): boolean {
  if (conditions.length === 0) return true;
  const fields = [...fieldsById.values()];
  const record = makeRecordContext(fields, cells);
  const results = conditions.map((c) => {
    const field = fieldsById.get(c.fieldId);
    if (!field) return false;
    return evaluateRecordCondition(field, record, fields, c.op, c.value);
  });
  return conjunction === "or" ? results.some(Boolean) : results.every(Boolean);
}

/** Enrich a raw cell snapshot so computed fields (link/lookup/rollup/count) resolve. */
async function enrichConditionCells(
  tableId: string,
  recordId: string | null | undefined,
  cells: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const rec = { id: recordId ?? "rec_ctx", cells: { ...cells } };
  const [enriched] = await enrichRecords(tableId, [rec]);
  return enriched.cells;
}

async function cellsForConditions(
  event: ChangeEvent
): Promise<Record<string, unknown>> {
  if (event.kind === "record.deleted" || !event.recordId) return event.kind === "record.deleted" ? event.before : {};
  return enrichConditionCells(event.tableId, event.recordId, event.after);
}

/** Does this automation's trigger fire for this event? */
function triggerMatches(
  automation: AutomationRow,
  event: ChangeEvent,
  fieldsById: Map<string, FieldDTO>,
  conditionCells: Record<string, unknown>,
  beforeConditionCells: Record<string, unknown>
): boolean {
  const cfg = automation.triggerConfig ?? {};
  switch (automation.triggerType) {
    case "recordCreated":
      return event.kind === "record.created";

    case "recordDeleted":
      return event.kind === "record.deleted";

    case "recordUpdated": {
      if (event.kind !== "record.updated") return false;
      if (cfg.watch === "fields") {
        const watched = new Set((cfg.fieldIds as string[]) ?? []);
        return event.changedFieldIds.some((id) => watched.has(id));
      }
      return true; // watch: "all"
    }

    case "recordMatchesCondition": {
      if (event.kind === "record.deleted") return false;
      const conditions = (cfg.conditions as FilterCondition[]) ?? [];
      return evalConditions(String(cfg.conjunction ?? "and"), conditions, fieldsById, conditionCells);
    }

    case "recordEntersCondition": {
      if (event.kind === "record.deleted") return false;
      const conditions = (cfg.conditions as FilterCondition[]) ?? [];
      const conjunction = String(cfg.conjunction ?? "and");
      const after = evalConditions(conjunction, conditions, fieldsById, conditionCells);
      // "Entered" = did not match before, matches now. Creates have no before.
      // `before` must be enriched too, or conditions on computed fields (which are
      // blank in the raw snapshot) always read false and the trigger misfires on
      // every qualifying update instead of only on the transition.
      const before =
        event.kind === "record.updated"
          ? evalConditions(conjunction, conditions, fieldsById, beforeConditionCells)
          : false;
      return after && !before;
    }

    case "scheduled":
      return false; // fired by the cron runner (tickScheduled), not the event path

    default:
      return false;
  }
}

async function processEvent(job: Job<ChangeEvent>): Promise<void> {
  const event = job.data;

  if (event.depth > MAX_AUTOMATION_DEPTH) {
    console.warn(
      `[worker] dropping event at depth ${event.depth} (> ${MAX_AUTOMATION_DEPTH}) — loop guard`
    );
    return;
  }

  const enabled = await db.query.automations.findMany({
    where: and(eq(automations.tableId, event.tableId), eq(automations.enabled, true)),
  });
  if (enabled.length === 0) return;

  const tableFields = (await db.query.fields.findMany({
    where: eq(fieldsTable.tableId, event.tableId),
  })) as unknown as FieldDTO[];
  const fieldsById = new Map(tableFields.map((f) => [f.id, f]));
  const conditionCells = await cellsForConditions(event);
  const beforeConditionCells =
    event.kind === "record.updated"
      ? await enrichConditionCells(event.tableId, event.recordId, event.before)
      : {};
  const runEvent = event.kind === "record.deleted" ? event : { ...event, after: conditionCells };

  for (const automation of enabled) {
    // Loop guard: don't let an automation re-trigger itself via its own writes.
    if (event.kind === "record.updated" && event.sourceAutomationId === automation.id) continue;

    if (!triggerMatches(automation, event, fieldsById, conditionCells, beforeConditionCells)) continue;

    try {
      await runAutomation(automation, runEvent);
    } catch (err) {
      // Per-automation isolation: one failing automation doesn't fail the job
      // (or block the others). runAutomation already persists step errors.
      console.error(`[worker] automation ${automation.id} failed:`, err);
    }
  }
}

const connection = getConnection();
if (!connection) {
  console.error("[worker] REDIS_URL not set — cannot start automation worker");
  process.exit(1);
}

const worker = new Worker<ChangeEvent>(AUTOMATION_QUEUE_NAME, processEvent, {
  connection,
  concurrency: 1, // preserve per-record event ordering in v1
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err);
});

/* -------- cron runner: fire scheduled automations when due -------- */
const SCHED_TICK_MS = Number(process.env.SCHED_TICK_MS) || 60_000;
let ticking = false;

async function tickScheduled(): Promise<void> {
  if (ticking) return; // ticks never overlap
  ticking = true;
  try {
    const now = new Date();
    const rows = await db.query.automations.findMany({
      where: and(eq(automations.triggerType, "scheduled"), eq(automations.enabled, true)),
    });
    for (const a of rows) {
      const spec = (a.triggerConfig ?? {}) as unknown as Schedule;
      if (!spec.frequency) continue;
      const since = a.lastScheduledRunAt ?? a.createdAt;
      if (!scheduleIsDue(spec, since, now)) continue;
      // Claim the slot before running so a slow run can't double-fire next tick.
      await db.update(automations).set({ lastScheduledRunAt: now }).where(eq(automations.id, a.id));
      try {
        await runAutomation(a, { kind: "scheduled", tableId: a.tableId, recordId: null, after: {}, depth: 0 });
      } catch (err) {
        console.error(`[worker] scheduled automation ${a.id} failed:`, err);
      }
    }
  } catch (err) {
    console.error("[worker] scheduled tick failed:", err);
  } finally {
    ticking = false;
  }
}

const schedTimer = setInterval(() => void tickScheduled(), SCHED_TICK_MS);
void tickScheduled(); // catch up shortly after boot

console.log("[worker] ready");

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, closing…`);
  clearInterval(schedTimer);
  await worker.close();
  await connection!.quit();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
