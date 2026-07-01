import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { fields, records } from "@/server/db/schema";
import { coerceCellValue, isComputed } from "@/lib/fields";

export async function listRecords(tableId: string, limit = 1000, offset = 0) {
  return db.query.records.findMany({
    where: eq(records.tableId, tableId),
    orderBy: asc(records.position),
    limit,
    offset,
  });
}

export async function countRecords(tableId: string) {
  const row = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(records)
    .where(eq(records.tableId, tableId));
  return row[0]?.count ?? 0;
}

/** Append a new empty record at the end. */
export async function createRecord(
  tableId: string,
  userId: string,
  cells: Record<string, unknown> = {}
) {
  const posRow = await db
    .select({ max: sql<number>`coalesce(max(${records.position}), -1)` })
    .from(records)
    .where(eq(records.tableId, tableId));
  const position = (posRow[0]?.max ?? -1) + 1;

  const [record] = await db
    .insert(records)
    .values({ tableId, position, cells, createdBy: userId, updatedBy: userId })
    .returning();
  return record;
}

/**
 * Update one or more cells of a record. Validates each value against its
 * field type and rejects writes to computed fields.
 */
export async function updateRecordCells(
  recordId: string,
  userId: string,
  patch: Record<string, unknown>
) {
  const record = await db.query.records.findFirst({ where: eq(records.id, recordId) });
  if (!record) throw new Error("Record not found");

  const tableFields = await db.query.fields.findMany({
    where: eq(fields.tableId, record.tableId),
  });
  const byId = new Map(tableFields.map((f) => [f.id, f]));

  const nextCells = { ...(record.cells as Record<string, unknown>) };
  for (const [fieldId, raw] of Object.entries(patch)) {
    const field = byId.get(fieldId);
    if (!field) throw new Error(`Unknown field ${fieldId}`);
    if (isComputed(field.type)) throw new Error(`Field "${field.name}" is computed`);

    const coerced = coerceCellValue(field.type, raw, field.options);
    if (coerced === undefined) delete nextCells[fieldId];
    else nextCells[fieldId] = coerced;
  }

  const [updated] = await db
    .update(records)
    .set({ cells: nextCells, updatedBy: userId, updatedAt: sql`now()` })
    .where(eq(records.id, recordId))
    .returning();
  return updated;
}

export async function deleteRecord(recordId: string) {
  await db.delete(records).where(eq(records.id, recordId));
}

/** Move a record to a new fractional position between neighbours. */
export async function reorderRecord(recordId: string, newPosition: number) {
  await db.update(records).set({ position: newPosition }).where(eq(records.id, recordId));
}

/** Close the position gap after deletes (optional housekeeping). */
export async function normalizePositions(tableId: string) {
  const rows = await db.query.records.findMany({
    where: eq(records.tableId, tableId),
    orderBy: asc(records.position),
  });
  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].position !== i) {
        await tx.update(records).set({ position: i }).where(eq(records.id, rows[i].id));
      }
    }
  });
}
