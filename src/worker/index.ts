import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { automations, fields as fieldsTable } from "@/server/db/schema";
import type { FieldDTO, FilterCondition } from "@/lib/types";
import { evaluateCondition } from "@/lib/query";
import { getConnection, AUTOMATION_QUEUE_NAME } from "@/server/automations/queue";
import { MAX_AUTOMATION_DEPTH } from "@/server/automations/context";
import { runAutomation } from "@/server/automations/run";
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
  const results = conditions.map((c) => {
    const field = fieldsById.get(c.fieldId);
    if (!field) return false;
    return evaluateCondition(field, cells[c.fieldId], c.op, c.value);
  });
  return conjunction === "or" ? results.some(Boolean) : results.every(Boolean);
}

/** Does this automation's trigger fire for this event? */
function triggerMatches(
  automation: AutomationRow,
  event: ChangeEvent,
  fieldsById: Map<string, FieldDTO>
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
      return evalConditions(String(cfg.conjunction ?? "and"), conditions, fieldsById, event.after);
    }

    case "recordEntersCondition": {
      if (event.kind === "record.deleted") return false;
      const conditions = (cfg.conditions as FilterCondition[]) ?? [];
      const conjunction = String(cfg.conjunction ?? "and");
      const after = evalConditions(conjunction, conditions, fieldsById, event.after);
      // "Entered" = did not match before, matches now. Creates have no before.
      const before =
        event.kind === "record.updated"
          ? evalConditions(conjunction, conditions, fieldsById, event.before)
          : false;
      return after && !before;
    }

    case "scheduled":
      return false; // schema-only in v1

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

  for (const automation of enabled) {
    // Loop guard: don't let an automation re-trigger itself via its own writes.
    if (event.kind === "record.updated" && event.sourceAutomationId === automation.id) continue;

    if (!triggerMatches(automation, event, fieldsById)) continue;

    try {
      await runAutomation(automation, event);
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

console.log("[worker] ready");

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, closing…`);
  await worker.close();
  await connection!.quit();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
