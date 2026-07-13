import { getQueue } from "./queue";
import { currentAutomationContext } from "./context";

/**
 * A record change event, enqueued post-commit by record/link mutations and
 * consumed by the automation worker. Cell maps hold *stored* values only —
 * computed fields (lookup/rollup/formula) live outside `records.cells` and are
 * therefore not visible to triggers/conditions/tokens (documented v1 limit).
 */
export type ChangeEvent =
  | {
      kind: "record.created";
      tableId: string;
      recordId: string;
      after: Record<string, unknown>;
      // Loop-guard metadata, stamped from the active automation context.
      depth: number;
      sourceRunId?: string;
      sourceAutomationId?: string;
    }
  | {
      kind: "record.updated";
      tableId: string;
      recordId: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      changedFieldIds: string[];
      depth: number;
      sourceRunId?: string;
      sourceAutomationId?: string;
    }
  | {
      kind: "record.deleted";
      tableId: string;
      recordId: string;
      before: Record<string, unknown>;
      depth: number;
      sourceRunId?: string;
      sourceAutomationId?: string;
    }
  | {
      // Synthesized by the cron runner (not emitted via emitChangeEvent) — a
      // scheduled automation firing has no triggering record.
      kind: "scheduled";
      tableId: string;
      recordId: null;
      after: Record<string, unknown>;
      depth: number;
      sourceRunId?: string;
      sourceAutomationId?: string;
    };

export type ChangeEventInput =
  | Omit<Extract<ChangeEvent, { kind: "record.created" }>, "depth" | "sourceRunId" | "sourceAutomationId">
  | Omit<Extract<ChangeEvent, { kind: "record.updated" }>, "depth" | "sourceRunId" | "sourceAutomationId">
  | Omit<Extract<ChangeEvent, { kind: "record.deleted" }>, "depth" | "sourceRunId" | "sourceAutomationId">;

/**
 * Fire-and-forget enqueue of a change event. Reads the active automation
 * context (if a mutation happened inside an automation action) to stamp loop-
 * guard depth and provenance. Never throws into the caller: if redis is
 * unconfigured or the enqueue fails, we warn and move on so the user's write
 * always succeeds.
 */
export function emitChangeEvent(input: ChangeEventInput): void {
  const queue = getQueue();
  if (!queue) {
    if (process.env.REDIS_URL) {
      console.warn("[automations] queue unavailable; skipping change event");
    }
    return;
  }

  const ctx = currentAutomationContext();
  const event = {
    ...input,
    depth: ctx ? ctx.depth + 1 : 0,
    sourceRunId: ctx?.sourceRunId,
    sourceAutomationId: ctx?.automationId,
  } as ChangeEvent;

  queue
    .add(event.kind, event, {
      attempts: 1,
      removeOnComplete: 1000,
      removeOnFail: 1000,
    })
    .catch((err) => {
      console.warn("[automations] failed to enqueue change event:", err);
    });
}
