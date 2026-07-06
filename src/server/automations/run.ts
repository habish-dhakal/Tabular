import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  automationActions,
  automationRuns,
  automationRunSteps,
  fields as fieldsTable,
} from "@/server/db/schema";
import type { FieldDTO } from "@/lib/types";
import { resolveSenders, type Senders } from "@/server/integrations/senders";
import { runWithAutomationContext } from "./context";
import { makeInterpolator } from "./interpolate";
import { executors, type ExecutorContext } from "./executors";
import type { ChangeEvent } from "./emit";

/** Minimal automation shape `runAutomation` needs. */
export interface RunnableAutomation {
  id: string;
  tableId: string;
  createdBy: string | null;
}

/** The record cells an event exposes to conditions/tokens. */
function eventCells(event: ChangeEvent): Record<string, unknown> {
  if (event.kind === "record.deleted") return event.before;
  return event.after;
}

/**
 * Execute an automation's action steps for a change event and persist a run +
 * per-step log. Shared by the worker and the `/test` route.
 *
 * Runs the whole step sequence inside an automation context so any record
 * mutations triggered by `createRecord`/`updateRecord` actions carry the
 * loop-guard depth + provenance on the events they emit.
 */
export async function runAutomation(
  automation: RunnableAutomation,
  event: ChangeEvent,
  opts: { senders?: Senders } = {}
): Promise<{ runId: string; status: "success" | "error" }> {
  const senders = opts.senders ?? resolveSenders();

  const [run] = await db
    .insert(automationRuns)
    .values({
      automationId: automation.id,
      tableId: automation.tableId,
      recordId: event.recordId,
      status: "running",
      trigger: event as unknown as Record<string, unknown>,
    })
    .returning();

  const actions = await db.query.automationActions.findMany({
    where: eq(automationActions.automationId, automation.id),
    orderBy: asc(automationActions.position),
  });

  // Order by position so token name→id resolution is deterministic (matches the
  // grid's field order) even when two fields share a name — later wins.
  const tableFields = (await db.query.fields.findMany({
    where: eq(fieldsTable.tableId, automation.tableId),
    orderBy: asc(fieldsTable.position),
  })) as unknown as FieldDTO[];
  const interpolate = makeInterpolator(tableFields, eventCells(event));

  const ctx: ExecutorContext = { senders, actingUserId: automation.createdBy };

  let runStatus: "success" | "error" = "success";
  let runError: string | null = null;

  await runWithAutomationContext(
    { depth: event.depth, sourceRunId: run.id, automationId: automation.id },
    async () => {
      for (const action of actions) {
        const input = interpolate(action.config) as Record<string, unknown>;
        const executor = executors[action.type];
        try {
          const output = await executor(input, ctx);
          await db.insert(automationRunSteps).values({
            runId: run.id,
            actionId: action.id,
            position: action.position,
            type: action.type,
            status: "success",
            input,
            output,
            finishedAt: new Date(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db.insert(automationRunSteps).values({
            runId: run.id,
            actionId: action.id,
            position: action.position,
            type: action.type,
            status: "error",
            input,
            error: message,
            finishedAt: new Date(),
          });
          runStatus = "error";
          runError = message;
          break; // fail-fast
        }
      }
    }
  );

  await db
    .update(automationRuns)
    .set({ status: runStatus, error: runError, finishedAt: new Date() })
    .where(eq(automationRuns.id, run.id));

  return { runId: run.id, status: runStatus };
}
