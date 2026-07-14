import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { deleteView, tableIdForView, updateView } from "@/server/services/views";

type Params = { params: Promise<{ viewId: string }> };

async function requireTableId(viewId: string) {
  const tableId = await tableIdForView(viewId);
  if (!tableId) throw new AccessError(404, "View not found");
  return tableId;
}

// View config is free-form JSON validated at the view-render layer.
const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  position: z.number().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { viewId } = await params;
    const tableId = await requireTableId(viewId);
    await assertTableAccess(userId, tableId, true);
    const patch = patchBody.parse(await req.json());
    return updateView(viewId, patch, userId);
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { viewId } = await params;
    const tableId = await requireTableId(viewId);
    await assertTableAccess(userId, tableId, true);
    await deleteView(viewId);
    return { ok: true };
  });
}
