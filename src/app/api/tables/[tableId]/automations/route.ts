import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import {
  createAutomation,
  getAutomation,
  listAutomations,
} from "@/server/services/automations";
import {
  automationActionKinds,
  automationActionTypes,
  automationTriggerTypes,
} from "@/server/db/schema";
import type { ActionInput } from "@/server/services/automations";

type Params = { params: Promise<{ tableId: string }> };

// Recursive: "loop"/"conditional" nodes nest child steps in `actions`.
const actionSchema: z.ZodType<ActionInput> = z.lazy(() =>
  z.object({
    kind: z.enum(automationActionKinds).optional(),
    type: z.enum(automationActionTypes).nullish(),
    config: z.record(z.string(), z.unknown()).default({}),
    actions: z.array(actionSchema).optional(),
  })
);

const createSchema = z.object({
  name: z.string().min(1).max(255),
  triggerType: z.enum(automationTriggerTypes),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().optional(),
  actions: z.array(actionSchema).default([]),
});

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    return listAutomations(tableId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    const input = createSchema.parse(await req.json());
    const id = await createAutomation(tableId, userId, input);
    return getAutomation(id);
  });
}
