import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { bases, tables, users, workspaceMembers, workspaces } from "@/server/db/schema";

export interface MemberDTO {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: string;
}

/** Workspace members for the workspace that owns `tableId` (mention candidates). */
export async function listMembersForTable(tableId: string): Promise<MemberDTO[]> {
  const row = await db
    .select({ workspaceId: bases.workspaceId })
    .from(tables)
    .innerJoin(bases, eq(tables.baseId, bases.id))
    .where(eq(tables.id, tableId))
    .limit(1);
  const workspaceId = row[0]?.workspaceId;
  if (!workspaceId) return [];

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  return rows;
}

/** The set of member user ids for the workspace owning `tableId`. */
export async function memberIdsForTable(tableId: string): Promise<Set<string>> {
  const members = await listMembersForTable(tableId);
  return new Set(members.map((m) => m.id));
}

/**
 * Guarantee the user belongs to at least one workspace. Prevents an
 * authenticated user from ever hitting a "no workspaces" dead-end
 * (e.g. after a reseed left their session pointing at a fresh id).
 * Returns true if it created one.
 */
export async function ensureDefaultWorkspace(userId: string): Promise<boolean> {
  const existing = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, userId),
  });
  if (existing) return false;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return false; // stale/ghost session id — nothing to attach to

  const label = user.name || user.email?.split("@")[0] || "My";
  const [ws] = await db
    .insert(workspaces)
    .values({ name: `${label}'s Workspace`, ownerId: userId })
    .returning();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: ws.id, userId, role: "owner" });
  return true;
}

/** All workspaces the user belongs to, each with its bases. */
export async function listWorkspacesForUser(userId: string) {
  const memberships = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.userId, userId),
  });
  const wsIds = memberships.map((m) => m.workspaceId);
  if (wsIds.length === 0) return [];

  const [wsRows, baseRows] = await Promise.all([
    db.query.workspaces.findMany({ where: inArray(workspaces.id, wsIds) }),
    db.query.bases.findMany({ where: inArray(bases.workspaceId, wsIds) }),
  ]);

  const roleByWs = new Map(memberships.map((m) => [m.workspaceId, m.role]));
  return wsRows.map((ws) => ({
    ...ws,
    role: roleByWs.get(ws.id),
    bases: baseRows.filter((b) => b.workspaceId === ws.id),
  }));
}

export async function createBase(workspaceId: string, name: string) {
  const [base] = await db.insert(bases).values({ workspaceId, name }).returning();
  return base;
}

/** Base + its tables (used for the base workspace page). */
export async function getBaseWithTables(baseId: string) {
  const base = await db.query.bases.findFirst({ where: eq(bases.id, baseId) });
  if (!base) return null;
  const tableRows = await db.query.tables.findMany({
    where: eq(tables.baseId, baseId),
    orderBy: asc(tables.position),
  });
  return { base, tables: tableRows };
}
