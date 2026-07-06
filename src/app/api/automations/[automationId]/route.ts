import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import {
  deleteAutomation,
  getAutomation,
  tableIdForAutomation,
  updateAutomation,
} from "@/server/services/automations";
import { automationActionTypes, automationTriggerTypes } from "@/server/db/schema";

type Params = { params: Promise<{ automationId: string }> };

const actionSchema = z.object({
  type: z.enum(automationActionTypes),
  config: z.record(z.string(), z.unknown()).default({}),
});

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  triggerType: z.enum(automationTriggerTypes).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(actionSchema).optional(),
});

async function tableFor(automationId: string) {
  const tableId = await tableIdForAutomation(automationId);
  if (!tableId) throw new AccessError(404, "Automation not found");
  return tableId;
}

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { automationId } = await params;
    await assertTableAccess(userId, await tableFor(automationId));
    const automation = await getAutomation(automationId);
    if (!automation) throw new AccessError(404, "Automation not found");
    return automation;
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { automationId } = await params;
    await assertTableAccess(userId, await tableFor(automationId), true);
    const input = patchSchema.parse(await req.json());
    await updateAutomation(automationId, input);
    return getAutomation(automationId);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { automationId } = await params;
    await assertTableAccess(userId, await tableFor(automationId), true);
    await deleteAutomation(automationId);
    return { ok: true };
  });
}
