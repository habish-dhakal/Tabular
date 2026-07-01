import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { linkOptions } from "@/server/services/links";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    return { options: await linkOptions(tableId) };
  });
}
