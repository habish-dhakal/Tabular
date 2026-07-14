import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { views, type ViewType } from "@/server/db/schema";
import type { ViewConfig } from "@/lib/types";

export async function createView(
  tableId: string,
  name: string,
  type: ViewType,
  config: ViewConfig = {},
  userId?: string
) {
  const posRow = await db
    .select({ max: sql<number>`coalesce(max(${views.position}), -1)` })
    .from(views)
    .where(eq(views.tableId, tableId));
  const position = (posRow[0]?.max ?? -1) + 1;

  const [view] = await db
    .insert(views)
    .values({ tableId, name, type, position, config: withViewOwner(config, userId) as Record<string, unknown> })
    .returning();
  return view;
}

export async function updateView(
  viewId: string,
  patch: { name?: string; config?: ViewConfig; position?: number },
  userId?: string
) {
  const existing = await db.query.views.findFirst({ where: eq(views.id, viewId) });
  if (!existing) return null;
  const existingConfig = (existing.config ?? {}) as ViewConfig;
  assertViewEditable(existingConfig, userId);
  const nextConfig = patch.config
    ? withViewOwner({ ...existingConfig, ...patch.config }, userId)
    : undefined;
  const [view] = await db
    .update(views)
    .set({ ...patch, config: nextConfig as Record<string, unknown> | undefined })
    .where(eq(views.id, viewId))
    .returning();
  return view;
}

export async function deleteView(viewId: string) {
  const remaining = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(views)
    .where(eq(views.tableId, sql`(select table_id from "view" where id = ${viewId})`));
  if ((remaining[0]?.count ?? 0) <= 1) {
    throw new Error("Cannot delete the last view");
  }
  await db.delete(views).where(eq(views.id, viewId));
}

export async function listViews(tableId: string, userId?: string) {
  const rows = await db.query.views.findMany({
    where: eq(views.tableId, tableId),
    orderBy: asc(views.position),
  });
  return rows.filter((view) => canSeeView((view.config ?? {}) as ViewConfig, userId));
}

export async function tableIdForView(viewId: string) {
  const row = await db
    .select({ tableId: views.tableId })
    .from(views)
    .where(eq(views.id, viewId))
    .limit(1);
  return row[0]?.tableId ?? null;
}

function withViewOwner(config: ViewConfig, userId?: string): ViewConfig {
  if (config.visibility !== "personal") return config;
  return { ...config, ownerId: userId };
}

function canSeeView(config: ViewConfig, userId?: string) {
  return config.visibility !== "personal" || !config.ownerId || config.ownerId === userId;
}

function assertViewEditable(config: ViewConfig, userId?: string) {
  if (config.locked) throw new Error("View is locked");
  if (config.visibility === "personal" && config.ownerId && config.ownerId !== userId) {
    throw new Error("Personal view belongs to another user");
  }
}
