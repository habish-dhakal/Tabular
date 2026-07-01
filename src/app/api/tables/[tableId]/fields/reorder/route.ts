import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { reorderFields } from "@/server/services/fields";

type Params = { params: Promise<{ tableId: string }> };

const body = z.object({ order: z.array(z.string()) });

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    const { order } = body.parse(await req.json());
    await reorderFields(tableId, order);
    return { ok: true };
  });
}
