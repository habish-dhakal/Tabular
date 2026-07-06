import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Loop-guard context.
 *
 * When an automation action mutates a record (createRecord/updateRecord), the
 * resulting mutation emits its own change event, which could re-trigger the
 * same or another automation forever. The worker runs each automation inside
 * `runWithAutomationContext`, so any change events emitted downstream of an
 * action carry an incremented `depth` and the originating `sourceRunId`.
 * `emitChangeEvent` reads this store to stamp outgoing events; the worker drops
 * jobs whose depth exceeds MAX_AUTOMATION_DEPTH.
 */
export interface AutomationContext {
  depth: number;
  sourceRunId: string;
  automationId: string;
}

export const MAX_AUTOMATION_DEPTH = 3;

const storage = new AsyncLocalStorage<AutomationContext>();

/** Run `fn` with the given automation context active for all downstream emits. */
export function runWithAutomationContext<T>(ctx: AutomationContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** The active automation context, if we're executing inside an automation run. */
export function currentAutomationContext(): AutomationContext | undefined {
  return storage.getStore();
}
