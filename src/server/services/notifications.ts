import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications, tables, users } from "@/server/db/schema";

export interface NotificationDTO {
  id: string;
  type: string;
  actorName: string | null;
  tableId: string | null;
  tableName: string | null;
  recordId: string | null;
  body: string | null;
  read: boolean;
  createdAt: string;
}

/** A user's notifications, newest first, with actor + table names resolved. */
export async function listNotifications(userId: string, limit = 30): Promise<NotificationDTO[]> {
  const rows = await db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: desc(notifications.createdAt),
    limit,
  });
  if (rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])];
  const tableIds = [...new Set(rows.map((r) => r.tableId).filter(Boolean) as string[])];
  const actorRows = actorIds.length
    ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, actorIds))
    : [];
  const tableRows = tableIds.length
    ? await db.select({ id: tables.id, name: tables.name }).from(tables).where(inArray(tables.id, tableIds))
    : [];
  const actorName = new Map(actorRows.map((a) => [a.id, a.name ?? a.email]));
  const tableName = new Map(tableRows.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actorName: r.actorId ? actorName.get(r.actorId) ?? null : null,
    tableId: r.tableId,
    tableName: r.tableId ? tableName.get(r.tableId) ?? null : null,
    recordId: r.recordId,
    body: r.body,
    read: r.readAt != null,
    createdAt: (r.createdAt as Date).toISOString(),
  }));
}

export async function unreadCount(userId: string): Promise<number> {
  const row = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row[0]?.count ?? 0;
}

/** Mark one notification (by id) or all of the user's as read. */
export async function markRead(userId: string, opts: { id?: string; all?: boolean }) {
  const base = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  if (opts.all) {
    await db.update(notifications).set({ readAt: new Date() }).where(base);
  } else if (opts.id) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(base, eq(notifications.id, opts.id)));
  }
}
