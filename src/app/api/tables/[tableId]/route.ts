import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { deleteTable, getTableBundle, renameTable } from "@/server/services/tables";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    const bundle = await getTableBundle(tableId, userId);
    if (!bundle) throw new AccessError(404, "Table not found");
    return bundle;
  });
}

const patchBody = z.object({ name: z.string().min(1).max(255) });

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    const { name } = patchBody.parse(await req.json());
    await renameTable(tableId, name);
    return { ok: true };
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    await deleteTable(tableId);
    emitProductionSafetyEvent({ kind: "table.delete", actorId: userId, tableId });
    return { ok: true };
  }, { rateLimit: "destructive" });
}
