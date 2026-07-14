import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { queryViewRecords } from "@/server/services/view-query";
import { tableIdForView } from "@/server/services/views";

type Params = { params: Promise<{ viewId: string }> };

const query = z.object({
  limit: z.coerce.number().optional(),
  cursor: z.string().optional(),
  search: z.string().optional(),
  includeTotal: z.coerce.boolean().optional(),
  loadAll: z.coerce.boolean().optional(),
});

export async function GET(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { viewId } = await params;
    const tableId = await tableIdForView(viewId);
    if (!tableId) throw new AccessError(404, "View not found");
    await assertTableAccess(userId, tableId);
    const parsed = query.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));
    return queryViewRecords(viewId, parsed);
  });
}
