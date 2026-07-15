import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { fields, fieldTypes } from "@/server/db/schema";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { deleteField, updateField } from "@/server/services/fields";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ fieldId: string }> };

async function tableIdForField(fieldId: string) {
  const row = await db
    .select({ tableId: fields.tableId })
    .from(fields)
    .where(eq(fields.id, fieldId))
    .limit(1);
  if (!row[0]) throw new AccessError(404, "Field not found");
  return row[0].tableId;
}

const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(fieldTypes).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  position: z.number().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { fieldId } = await params;
    const tableId = await tableIdForField(fieldId);
    await assertTableAccess(userId, tableId, true);
    const patch = patchBody.parse(await req.json());
    return updateField(fieldId, patch);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { fieldId } = await params;
    const tableId = await tableIdForField(fieldId);
    await assertTableAccess(userId, tableId, true);
    await deleteField(fieldId);
    emitProductionSafetyEvent({ kind: "field.delete", actorId: userId, tableId, targetId: fieldId });
    return { ok: true };
  }, { rateLimit: "destructive" });
}
