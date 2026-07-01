import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  bases,
  tables,
  workspaceMembers,
  type WorkspaceRole,
} from "@/server/db/schema";

export class AccessError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const WRITE_ROLES: WorkspaceRole[] = ["owner", "admin", "editor"];

async function roleInWorkspace(userId: string, workspaceId: string) {
  const m = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, userId)
    ),
  });
  return m?.role ?? null;
}

/** Resolve the workspace a table belongs to (table → base → workspace). */
export async function workspaceIdForTable(tableId: string) {
  const row = await db
    .select({ workspaceId: bases.workspaceId })
    .from(tables)
    .innerJoin(bases, eq(tables.baseId, bases.id))
    .where(eq(tables.id, tableId))
    .limit(1);
  return row[0]?.workspaceId ?? null;
}

export async function assertWorkspaceAccess(
  userId: string,
  workspaceId: string,
  write = false
) {
  const role = await roleInWorkspace(userId, workspaceId);
  if (!role) throw new AccessError(404, "Workspace not found");
  if (write && !WRITE_ROLES.includes(role)) {
    throw new AccessError(403, "You don't have permission to edit this");
  }
  return role;
}

export async function assertBaseAccess(userId: string, baseId: string, write = false) {
  const base = await db.query.bases.findFirst({ where: eq(bases.id, baseId) });
  if (!base) throw new AccessError(404, "Base not found");
  await assertWorkspaceAccess(userId, base.workspaceId, write);
  return base;
}

export async function assertTableAccess(userId: string, tableId: string, write = false) {
  const wsId = await workspaceIdForTable(tableId);
  if (!wsId) throw new AccessError(404, "Table not found");
  await assertWorkspaceAccess(userId, wsId, write);
  return wsId;
}
