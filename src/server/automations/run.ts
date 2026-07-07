import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  automationActions,
  automationRuns,
  automationRunSteps,
  fields as fieldsTable,
} from "@/server/db/schema";
import type { FieldDTO, FilterCondition } from "@/lib/types";
import { evaluateCondition } from "@/lib/query";
import { resolveSenders, type Senders } from "@/server/integrations/senders";
import { runWithAutomationContext } from "./context";
import { makeInterpolator, type ItemContext } from "./interpolate";
import { executors, type ExecutorContext } from "./executors";
import { runUserScript } from "./sandbox";
import {
  buildActionTree,
  resolveLoopItems,
  MAX_GROUP_DEPTH,
  MAX_RUN_STEPS,
  type ActionNode,
  type FlatAction,
  type LoopSource,
} from "./loop";
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

/** Thrown to unwind the recursion when a step fails (fail-fast). */
class StepFailure extends Error {}

/** Project a record's cells (keyed by field id) into a name→value map for scripts. */
function cellsByName(fields: FieldDTO[], cells: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f.name] = cells[f.id];
  return out;
}

/** Evaluate a conditional group's `{ conjunction, conditions }` against a record. */
function conditionsMatch(
  config: Record<string, unknown>,
  fields: FieldDTO[],
  cells: Record<string, unknown>
): boolean {
  const conditions = (config.conditions as FilterCondition[]) ?? [];
  if (conditions.length === 0) return true;
  const byId = new Map(fields.map((f) => [f.id, f]));
  const results = conditions.map((c) => {
    const field = byId.get(c.fieldId);
    if (!field) return false;
    return evaluateCondition(field, cells[c.fieldId], c.op, c.value);
  });
  return (config.conjunction ?? "and") === "or"
    ? results.some(Boolean)
    : results.every(Boolean);
}

/**
 * Execute an automation's action tree for a change event and persist a run +
 * per-step log. Shared by the worker and the `/test` route.
 *
 * The tree supports leaf action steps plus "loop" (repeating group) and
 * "conditional" group nodes. Everything runs inside an automation context so
 * downstream record mutations carry the loop-guard depth + provenance.
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

  const actionRows = (await db.query.automationActions.findMany({
    where: eq(automationActions.automationId, automation.id),
    orderBy: asc(automationActions.position),
  })) as unknown as FlatAction[];
  const tree = buildActionTree(actionRows);

  // Order by position so token name→id resolution is deterministic (matches the
  // grid's field order) even when two fields share a name — later wins.
  const triggerFields = (await db.query.fields.findMany({
    where: eq(fieldsTable.tableId, automation.tableId),
    orderBy: asc(fieldsTable.position),
  })) as unknown as FieldDTO[];
  const triggerCells = eventCells(event);

  const ctx: ExecutorContext = { senders, actingUserId: automation.createdBy };

  let runStatus: "success" | "error" = "success";
  let runError: string | null = null;
  let stepCount = 0;
  // Values emitted by runScript steps via output.set(), referenceable by later
  // steps as {{output.key}}.
  const scriptOutputs: Record<string, unknown> = {};

  const runNodes = async (nodes: ActionNode[], item: ItemContext | undefined, depth: number) => {
    // The record conditions/tokens resolve against: the loop item if inside a
    // loop, otherwise the trigger record.
    const curFields = item?.fields ?? triggerFields;
    const curCells = item?.cells ?? triggerCells;
    const interpolate = makeInterpolator(triggerFields, triggerCells, item, scriptOutputs);

    for (const node of nodes) {
      if (node.kind === "loop") {
        if (depth >= MAX_GROUP_DEPTH) throw new StepFailure(`loop nesting exceeds ${MAX_GROUP_DEPTH}`);
        const source = interpolate(node.config).source as LoopSource | undefined;
        if (!source) throw new StepFailure("loop is missing a source");
        const { items, fields } = await resolveLoopItems(source, triggerFields, triggerCells);
        for (const rec of items) {
          await runNodes(node.children, { fields, cells: rec.cells }, depth + 1);
        }
        continue;
      }

      if (node.kind === "conditional") {
        const cfg = interpolate(node.config) as Record<string, unknown>;
        if (conditionsMatch(cfg, curFields, curCells)) {
          await runNodes(node.children, item, depth + 1);
        }
        continue;
      }

      // Leaf action.
      if (++stepCount > MAX_RUN_STEPS) throw new StepFailure(`run exceeds ${MAX_RUN_STEPS} steps`);
      const position = stepCount;

      // runScript is handled here (not via executors) — it needs the current
      // record/item + captures outputs for later {{output.*}} tokens.
      if (node.type === "runScript") {
        const code = String(node.config.code ?? "");
        const scriptInput = {
          record: cellsByName(curFields, curCells),
          item: item ? cellsByName(item.fields, item.cells) : null,
        };
        try {
          const { outputs, logs } = await runUserScript(code, scriptInput);
          Object.assign(scriptOutputs, outputs);
          await db.insert(automationRunSteps).values({
            runId: run.id, actionId: node.id, position, type: "runScript", status: "success", input: { code }, output: { outputs, logs }, finishedAt: new Date(),
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await db.insert(automationRunSteps).values({
            runId: run.id, actionId: node.id, position, type: "runScript", status: "error", input: { code }, error: message, finishedAt: new Date(),
          });
          runError = message;
          throw new StepFailure(message);
        }
        continue;
      }

      const executor = node.type ? executors[node.type] : undefined;
      if (!node.type || !executor) throw new StepFailure(`unknown action type "${node.type}"`);
      const actionType = node.type;
      const input = interpolate(node.config) as Record<string, unknown>;
      try {
        const output = await executor(input, ctx);
        await db.insert(automationRunSteps).values({
          runId: run.id, actionId: node.id, position, type: actionType, status: "success", input, output, finishedAt: new Date(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db.insert(automationRunSteps).values({
          runId: run.id, actionId: node.id, position, type: actionType, status: "error", input, error: message, finishedAt: new Date(),
        });
        runError = message;
        throw new StepFailure(message);
      }
    }
  };

  await runWithAutomationContext(
    { depth: event.depth, sourceRunId: run.id, automationId: automation.id },
    async () => {
      try {
        await runNodes(tree, undefined, 0);
      } catch (err) {
        runStatus = "error";
        if (!runError) runError = err instanceof Error ? err.message : String(err);
      }
    }
  );

  await db
    .update(automationRuns)
    .set({ status: runStatus, error: runError, finishedAt: new Date() })
    .where(eq(automationRuns.id, run.id));

  return { runId: run.id, status: runStatus };
}
