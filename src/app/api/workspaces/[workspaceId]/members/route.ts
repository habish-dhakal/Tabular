import { handle, requireUserId } from "@/server/api-helpers";
import { assertWorkspaceAccess } from "@/server/services/access";
import { listMembers } from "@/server/services/members";

type Params = { params: Promise<{ workspaceId: string }> };

/** List a workspace's members (any member may view). */
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { workspaceId } = await params;
    await assertWorkspaceAccess(userId, workspaceId);
    return listMembers(workspaceId);
  });
}
