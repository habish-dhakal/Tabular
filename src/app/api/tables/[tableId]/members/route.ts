import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { listMembersForTable } from "@/server/services/workspaces";

type Params = { params: Promise<{ tableId: string }> };

/** Workspace members for this table — used as @mention candidates. */
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    return listMembersForTable(tableId);
  });
}
