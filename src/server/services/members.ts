import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users, workspaceMembers, workspaces, type WorkspaceRole } from "@/server/db/schema";
import { AccessError } from "@/server/services/access";
import { isInvitableRole } from "@/server/services/member-policy";

export interface WorkspaceMemberDTO {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: WorkspaceRole;
  isOwner: boolean;
  joinedAt: string;
}

/** Members of a workspace, owner first, then by join date. */
export async function listMembers(workspaceId: string): Promise<WorkspaceMemberDTO[]> {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      image: r.image,
      role: r.role,
      isOwner: r.id === ws?.ownerId,
      joinedAt: (r.joinedAt as Date).toISOString(),
    }))
    .sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
}

/** Change a member's role. The owner's role is immutable; owner can't be granted. */
export async function updateMemberRole(
  workspaceId: string,
  targetUserId: string,
  role: string
): Promise<WorkspaceMemberDTO> {
  if (!isInvitableRole(role)) throw new AccessError(400, "Invalid role");
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (ws?.ownerId === targetUserId) {
    throw new AccessError(400, "The workspace owner's role can't be changed");
  }
  const [updated] = await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, targetUserId)
      )
    )
    .returning();
  if (!updated) throw new AccessError(404, "Member not found");
  const [member] = await listMembersById(workspaceId, targetUserId);
  return member;
}

/** Remove a member. The owner can never be removed. */
export async function removeMember(workspaceId: string, targetUserId: string) {
  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (ws?.ownerId === targetUserId) {
    throw new AccessError(400, "The workspace owner can't be removed");
  }
  const deleted = await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, targetUserId)
      )
    )
    .returning();
  if (!deleted.length) throw new AccessError(404, "Member not found");
  return { ok: true };
}

async function listMembersById(workspaceId: string, userId: string) {
  const all = await listMembers(workspaceId);
  return all.filter((m) => m.id === userId);
}
