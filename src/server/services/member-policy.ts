/**
 * Member / invite policy — dependency-free (no DB imports) so it can be
 * unit-tested cheaply and shared between the service layer and tests.
 *
 * The rules encoded here are the security-relevant ones: who may manage
 * members, which roles an invite may grant, whether an email-pinned invite
 * matches a user, and the lifecycle state of an invite.
 */
import type { WorkspaceRole } from "@/server/db/schema";

/** Roles allowed to manage members + invites (invite, change role, remove). */
export const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin"];

/**
 * Roles an invite (or a role change) may grant. "owner" is deliberately
 * excluded — a workspace has exactly one owner, tied to `workspace.ownerId`.
 */
export const INVITABLE_ROLES: WorkspaceRole[] = ["admin", "editor", "commenter", "viewer"];

export function canManageMembers(role: WorkspaceRole | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role);
}

export function isInvitableRole(role: string): role is WorkspaceRole {
  return (INVITABLE_ROLES as string[]).includes(role);
}

/**
 * An invite matches a user iff it isn't pinned to an email, or the pinned
 * email equals the user's email (trimmed, case-insensitive).
 */
export function inviteEmailMatches(
  inviteEmail: string | null | undefined,
  userEmail: string | null | undefined
): boolean {
  if (!inviteEmail) return true;
  if (!userEmail) return false;
  return inviteEmail.trim().toLowerCase() === userEmail.trim().toLowerCase();
}

export type InviteState = "pending" | "accepted" | "expired";

export function inviteState(
  inv: { acceptedAt: Date | null; expiresAt: Date | null },
  now: Date
): InviteState {
  if (inv.acceptedAt) return "accepted";
  if (inv.expiresAt && inv.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}
