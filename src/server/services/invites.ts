import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  users,
  workspaceInvites,
  workspaceMembers,
  workspaces,
} from "@/server/db/schema";
import { AccessError } from "@/server/services/access";
import {
  inviteEmailMatches,
  inviteState,
  isInvitableRole,
  type InviteState,
} from "@/server/services/member-policy";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface InviteDTO {
  id: string;
  workspaceId: string;
  role: string;
  email: string | null;
  state: InviteState;
  createdAt: string;
  expiresAt: string | null;
  invitedBy: { id: string; name: string | null; email: string } | null;
}

function toDTO(inv: typeof workspaceInvites.$inferSelect, invitedBy: InviteDTO["invitedBy"], now: Date): InviteDTO {
  return {
    id: inv.id,
    workspaceId: inv.workspaceId,
    role: inv.role,
    email: inv.email,
    state: inviteState(inv, now),
    createdAt: (inv.createdAt as Date).toISOString(),
    expiresAt: inv.expiresAt ? (inv.expiresAt as Date).toISOString() : null,
    invitedBy,
  };
}

/** Create an invite link for a workspace. Returns the invite (its id is the token). */
export async function createInvite(
  workspaceId: string,
  invitedById: string,
  role: string,
  email?: string | null
): Promise<InviteDTO> {
  if (!isInvitableRole(role)) throw new AccessError(400, "Invalid role");
  const now = new Date();
  const [inv] = await db
    .insert(workspaceInvites)
    .values({
      workspaceId,
      invitedById,
      role,
      email: email?.trim() || null,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    })
    .returning();
  const inviter = await db.query.users.findFirst({
    where: eq(users.id, invitedById),
    columns: { id: true, name: true, email: true },
  });
  return toDTO(inv, inviter ?? null, now);
}

/** Non-accepted invites for a workspace (pending + expired), newest first. */
export async function listInvites(workspaceId: string): Promise<InviteDTO[]> {
  const now = new Date();
  const rows = await db.query.workspaceInvites.findMany({
    where: eq(workspaceInvites.workspaceId, workspaceId),
    orderBy: asc(workspaceInvites.createdAt),
    with: { invitedBy: { columns: { id: true, name: true, email: true } } },
  });
  return rows
    .filter((inv) => !inv.acceptedAt)
    .map((inv) => toDTO(inv, inv.invitedBy ?? null, now))
    .reverse();
}

export async function inviteById(inviteId: string) {
  return db.query.workspaceInvites.findFirst({ where: eq(workspaceInvites.id, inviteId) });
}

/** Preview an invite for the accept page (workspace name + inviter + state). */
export async function previewInvite(token: string) {
  const inv = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.id, token),
    with: {
      workspace: { columns: { id: true, name: true } },
      invitedBy: { columns: { id: true, name: true, email: true } },
    },
  });
  if (!inv) throw new AccessError(404, "Invite not found");
  return {
    workspace: inv.workspace ? { id: inv.workspace.id, name: inv.workspace.name } : null,
    role: inv.role,
    email: inv.email,
    state: inviteState(inv, new Date()),
    invitedBy: inv.invitedBy ?? null,
  };
}

/** Revoke (delete) an invite. */
export async function revokeInvite(inviteId: string) {
  const deleted = await db
    .delete(workspaceInvites)
    .where(eq(workspaceInvites.id, inviteId))
    .returning();
  if (!deleted.length) throw new AccessError(404, "Invite not found");
  return { ok: true };
}

/**
 * Redeem an invite for the given user. Validates state + email pin, adds the
 * user to the workspace (never downgrading an existing membership), and marks
 * the invite used. Idempotent-ish: a used/expired invite is rejected.
 */
export async function acceptInvite(token: string, userId: string) {
  const inv = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.id, token),
  });
  if (!inv) throw new AccessError(404, "Invite not found");

  const state = inviteState(inv, new Date());
  if (state === "accepted") throw new AccessError(410, "This invite has already been used");
  if (state === "expired") throw new AccessError(410, "This invite has expired");

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!inviteEmailMatches(inv.email, user?.email ?? null)) {
    throw new AccessError(403, "This invite is for a different email address");
  }

  const existing = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, inv.workspaceId),
      eq(workspaceMembers.userId, userId)
    ),
  });
  if (!existing) {
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: inv.workspaceId, userId, role: inv.role });
  }

  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date(), acceptedById: userId })
    .where(eq(workspaceInvites.id, token));

  const ws = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, inv.workspaceId),
    columns: { id: true, name: true },
  });
  return {
    workspace: ws ?? null,
    role: existing?.role ?? inv.role,
    alreadyMember: !!existing,
  };
}
