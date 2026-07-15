import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertWorkspaceAdminAccess } from "@/server/services/access";
import { removeMember, updateMemberRole } from "@/server/services/members";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ workspaceId: string; userId: string }> };

const patchBody = z.object({ role: z.string() });

/** Change a member's role (admin only). */
export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const actorId = await requireUserId();
    const { workspaceId, userId } = await params;
    await assertWorkspaceAdminAccess(actorId, workspaceId);
    const { role } = patchBody.parse(await req.json());
    return updateMemberRole(workspaceId, userId, role);
  });
}

/** Remove a member (admin only). */
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const actorId = await requireUserId();
    const { workspaceId, userId } = await params;
    await assertWorkspaceAdminAccess(actorId, workspaceId);
    const result = await removeMember(workspaceId, userId);
    emitProductionSafetyEvent({ kind: "member.remove", actorId, workspaceId, targetId: userId });
    return result;
  }, { rateLimit: "destructive" });
}
