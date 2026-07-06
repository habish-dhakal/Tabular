import type { AutomationActionType } from "@/server/db/schema";
import type { Senders } from "@/server/integrations/senders";
import { sendEmail } from "./sendEmail";
import { sendSlack } from "./sendSlack";
import { appendGoogleSheet } from "./appendGoogleSheet";
import { createRecord } from "./createRecord";
import { updateRecord } from "./updateRecord";
import { httpRequest } from "./httpRequest";

/** Shared context handed to every executor for one run. */
export interface ExecutorContext {
  senders: Senders;
  /** Acting user for record mutations (the automation's creator). */
  actingUserId: string | null;
}

/**
 * An executor receives the **already-interpolated** action config and returns
 * a JSON-serializable output that becomes the step log's `output`. Throwing
 * fails the step (and, fail-fast, the run).
 */
export type Executor = (
  input: Record<string, unknown>,
  ctx: ExecutorContext
) => Promise<Record<string, unknown>>;

export const executors: Record<AutomationActionType, Executor> = {
  sendEmail,
  sendSlack,
  appendGoogleSheet,
  createRecord,
  updateRecord,
  httpRequest,
};
