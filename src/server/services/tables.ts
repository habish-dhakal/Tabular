import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { fields, records, tables, views } from "@/server/db/schema";

/** Create a table with a sensible default schema: a primary text field,
 *  a couple of starter fields, a grid view, and 3 empty rows. */
export async function createTable(baseId: string, name: string) {
  return db.transaction(async (tx) => {
    const posRow = await tx
      .select({ max: sql<number>`coalesce(max(${tables.position}), 0)` })
      .from(tables)
      .where(eq(tables.baseId, baseId));
    const position = (posRow[0]?.max ?? 0) + 1;

    const [table] = await tx
      .insert(tables)
      .values({ baseId, name, position })
      .returning();

    const [primary] = await tx
      .insert(fields)
      .values({ tableId: table.id, name: "Name", type: "singleLineText", position: 0, isPrimary: true })
      .returning();
    await tx.insert(fields).values([
      { tableId: table.id, name: "Notes", type: "longText", position: 1 },
      { tableId: table.id, name: "Status", type: "singleSelect", position: 2, options: {
        choices: [
          { id: "todo", name: "Todo", color: "#eab308" },
          { id: "doing", name: "In progress", color: "#3b82f6" },
          { id: "done", name: "Done", color: "#22c55e" },
        ],
      } },
    ]);

    const [view] = await tx
      .insert(views)
      .values({ tableId: table.id, name: "Grid view", type: "grid", position: 0 })
      .returning();

    await tx.insert(records).values(
      [0, 1, 2].map((i) => ({ tableId: table.id, position: i, cells: {} }))
    );

    return { table, primaryFieldId: primary.id, viewId: view.id };
  });
}

export async function listTables(baseId: string) {
  return db.query.tables.findMany({
    where: eq(tables.baseId, baseId),
    orderBy: asc(tables.position),
  });
}

/** Full payload the grid needs: table meta, its fields, and its views. */
export async function getTableBundle(tableId: string) {
  const table = await db.query.tables.findFirst({ where: eq(tables.id, tableId) });
  if (!table) return null;
  const [fieldList, viewList] = await Promise.all([
    db.query.fields.findMany({ where: eq(fields.tableId, tableId), orderBy: asc(fields.position) }),
    db.query.views.findMany({ where: eq(views.tableId, tableId), orderBy: asc(views.position) }),
  ]);
  return { table, fields: fieldList, views: viewList };
}

export async function renameTable(tableId: string, name: string) {
  await db.update(tables).set({ name }).where(eq(tables.id, tableId));
}

export async function deleteTable(tableId: string) {
  await db.delete(tables).where(eq(tables.id, tableId));
}
