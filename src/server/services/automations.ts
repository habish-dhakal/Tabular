import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  automationActions,
  automationRuns,
  automationRunSteps,
  automations,
  type AutomationActionType,
  type AutomationTriggerType,
} from "@/server/db/schema";

export interface ActionInput {
  type: AutomationActionType;
  config: Record<string, unknown>;
}

export interface CreateAutomationInput {
  name: string;
  triggerType: AutomationTriggerType;
  triggerConfig?: Record<string, unknown>;
  enabled?: boolean;
  actions: ActionInput[];
}

export interface UpdateAutomationInput {
  name?: string;
  enabled?: boolean;
  triggerType?: AutomationTriggerType;
  triggerConfig?: Record<string, unknown>;
  actions?: ActionInput[];
}

/** All automations for a table, each with its ordered action steps. */
export async function listAutomations(tableId: string) {
  return db.query.automations.findMany({
    where: eq(automations.tableId, tableId),
    orderBy: asc(automations.createdAt),
    with: { actions: { orderBy: asc(automationActions.position) } },
  });
}

export async function getAutomation(automationId: string) {
  return db.query.automations.findFirst({
    where: eq(automations.id, automationId),
    with: { actions: { orderBy: asc(automationActions.position) } },
  });
}

export async function tableIdForAutomation(automationId: string): Promise<string | null> {
  const row = await db
    .select({ tableId: automations.tableId })
    .from(automations)
    .where(eq(automations.id, automationId))
    .limit(1);
  return row[0]?.tableId ?? null;
}

export async function createAutomation(
  tableId: string,
  userId: string,
  input: CreateAutomationInput
) {
  return db.transaction(async (tx) => {
    const [automation] = await tx
      .insert(automations)
      .values({
        tableId,
        name: input.name,
        enabled: input.enabled ?? true,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig ?? {},
        createdBy: userId,
      })
      .returning();

    if (input.actions.length) {
      await tx.insert(automationActions).values(
        input.actions.map((a, i) => ({
          automationId: automation.id,
          type: a.type,
          position: i,
          config: a.config,
        }))
      );
    }
    return automation.id;
  });
}

export async function updateAutomation(automationId: string, input: UpdateAutomationInput) {
  return db.transaction(async (tx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.enabled !== undefined) patch.enabled = input.enabled;
    if (input.triggerType !== undefined) patch.triggerType = input.triggerType;
    if (input.triggerConfig !== undefined) patch.triggerConfig = input.triggerConfig;

    await tx.update(automations).set(patch).where(eq(automations.id, automationId));

    // Replace the whole action list when provided (builder saves the full set).
    if (input.actions) {
      await tx.delete(automationActions).where(eq(automationActions.automationId, automationId));
      if (input.actions.length) {
        await tx.insert(automationActions).values(
          input.actions.map((a, i) => ({
            automationId,
            type: a.type,
            position: i,
            config: a.config,
          }))
        );
      }
    }
  });
}

export async function deleteAutomation(automationId: string) {
  await db.delete(automations).where(eq(automations.id, automationId));
}

/** Run history for an automation, newest first, each with its ordered steps. */
export async function listRuns(automationId: string, limit = 50) {
  return db.query.automationRuns.findMany({
    where: eq(automationRuns.automationId, automationId),
    orderBy: desc(automationRuns.startedAt),
    limit,
    with: { steps: { orderBy: asc(automationRunSteps.position) } },
  });
}
