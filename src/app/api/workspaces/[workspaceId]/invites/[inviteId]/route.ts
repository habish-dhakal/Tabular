import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertWorkspaceAdminAccess } from "@/server/services/access";
import { inviteById, revokeInvite } from "@/server/services/invites";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ workspaceId: string; inviteId: string }> };

/** Revoke an invite (admin only). */
export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { workspaceId, inviteId } = await params;
    await assertWorkspaceAdminAccess(userId, workspaceId);
    const inv = await inviteById(inviteId);
    // Guard against revoking another workspace's invite via a mismatched path.
    if (!inv || inv.workspaceId !== workspaceId) throw new AccessError(404, "Invite not found");
    const result = await revokeInvite(inviteId);
    emitProductionSafetyEvent({ kind: "invite.revoke", actorId: userId, workspaceId, targetId: inviteId });
    return result;
  }, { rateLimit: "destructive" });
}
