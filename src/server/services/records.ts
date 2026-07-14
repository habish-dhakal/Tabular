import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { fields, records } from "@/server/db/schema";
import {
  duplicateUniqueValue,
  fieldIsUnique,
  normalizeInitialCells,
  normalizePatchedCells,
  userIdsForFieldValue,
  validateRequiredFields,
} from "@/lib/field-behavior";
import type { FieldDTO, RecordDTO } from "@/lib/types";
import { isBlankValue } from "@/lib/value-resolver";
import { emitChangeEvent } from "@/server/automations/emit";
import { memberIdsForTable } from "@/server/services/workspaces";

/** Shallow JSON-value equality for two cell values (stored primitives/arrays). */
function cellsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

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
  const tableFields = await db.query.fields.findMany({ where: eq(fields.tableId, tableId) }) as unknown as FieldDTO[];
  const normalizedCells = normalizeInitialCells(tableFields, cells);
  validateRequiredFields(tableFields, normalizedCells);
  await validateUserMembers(tableId, tableFields, normalizedCells);
  await validateUniqueCells(tableId, tableFields, normalizedCells);

  const posRow = await db
    .select({ max: sql<number>`coalesce(max(${records.position}), -1)` })
    .from(records)
    .where(eq(records.tableId, tableId));
  const position = (posRow[0]?.max ?? -1) + 1;

  const [record] = await db
    .insert(records)
    .values({ tableId, position, cells: normalizedCells, createdBy: userId, updatedBy: userId })
    .returning();

  emitChangeEvent({
    kind: "record.created",
    tableId,
    recordId: record.id,
    after: record.cells as Record<string, unknown>,
  });
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
  }) as unknown as FieldDTO[];

  const before = { ...(record.cells as Record<string, unknown>) };
  const nextCells = normalizePatchedCells(tableFields, before, patch);
  validateRequiredFields(tableFields, nextCells);
  await validateUserMembers(record.tableId, tableFields, nextCells);
  await validateUniqueCells(record.tableId, tableFields, nextCells, recordId);

  const [updated] = await db
    .update(records)
    .set({ cells: nextCells, updatedBy: userId, updatedAt: sql`now()` })
    .where(eq(records.id, recordId))
    .returning();

  const after = updated.cells as Record<string, unknown>;
  const changedFieldIds = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (fieldId) => !cellsEqual(before[fieldId], after[fieldId])
  );
  if (changedFieldIds.length) {
    emitChangeEvent({
      kind: "record.updated",
      tableId: record.tableId,
      recordId,
      before,
      after,
      changedFieldIds,
    });
  }
  return updated;
}

async function validateUserMembers(
  tableId: string,
  tableFields: FieldDTO[],
  cells: Record<string, unknown>
) {
  const ids = new Set<string>();
  for (const field of tableFields) {
    for (const userId of userIdsForFieldValue(field, cells[field.id])) ids.add(userId);
  }
  if (ids.size === 0) return;
  const members = await memberIdsForTable(tableId);
  for (const userId of ids) {
    if (!members.has(userId)) throw new Error(`User "${userId}" is not a workspace member`);
  }
}

async function validateUniqueCells(
  tableId: string,
  tableFields: FieldDTO[],
  cells: Record<string, unknown>,
  excludeRecordId?: string
) {
  const uniqueFields = tableFields.filter((field) => fieldIsUnique(field) && !isBlankValue(cells[field.id]));
  if (uniqueFields.length === 0) return;
  const existing = await db.query.records.findMany({ where: eq(records.tableId, tableId) }) as unknown as RecordDTO[];
  for (const field of uniqueFields) {
    const duplicate = duplicateUniqueValue(existing, field, cells[field.id], excludeRecordId);
    if (duplicate) throw new Error(`Field "${field.name}" must be unique`);
  }
}

export async function deleteRecord(recordId: string) {
  const record = await db.query.records.findFirst({ where: eq(records.id, recordId) });
  if (!record) return;

  await db.delete(records).where(eq(records.id, recordId));

  emitChangeEvent({
    kind: "record.deleted",
    tableId: record.tableId,
    recordId,
    before: record.cells as Record<string, unknown>,
  });
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
