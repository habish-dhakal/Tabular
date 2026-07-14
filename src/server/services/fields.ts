import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { fields, records, type FieldType } from "@/server/db/schema";
import {
  defaultValueForField,
  fieldCanStoreCellValue,
  fieldIsRequired,
  fieldIsUnique,
  previewFieldConversion,
  normalizeWritableFieldValue,
  valuesEqual,
} from "@/lib/field-behavior";
import { FIELD_TYPE_META } from "@/lib/fields";
import type { FieldDTO, RecordDTO } from "@/lib/types";
import { isBlankValue } from "@/lib/value-resolver";

export async function createField(
  tableId: string,
  name: string,
  type: FieldType,
  options?: Record<string, unknown>
) {
  return db.transaction(async (tx) => {
    const posRow = await tx
      .select({ max: sql<number>`coalesce(max(${fields.position}), -1)` })
      .from(fields)
      .where(eq(fields.tableId, tableId));
    const position = (posRow[0]?.max ?? -1) + 1;

    const defaults = FIELD_TYPE_META[type].defaultOptions ?? {};
    const createdFields = await tx
      .insert(fields)
      .values({ tableId, name, type, position, options: { ...defaults, ...options } })
      .returning();
    const [field] = createdFields as unknown as FieldDTO[];

    const rows = await tx.query.records.findMany({ where: eq(records.tableId, tableId) }) as unknown as RecordDTO[];
    const defaultValue = defaultValueForField(field);
    if (defaultValue !== undefined) {
      for (const row of rows) {
        const cells = { ...(row.cells as Record<string, unknown>), [field.id]: defaultValue };
        await tx.update(records).set({ cells }).where(eq(records.id, row.id));
        row.cells = cells;
      }
    }
    validateExistingRowsForField(field, rows);
    return field;
  });
}

export async function updateField(
  fieldId: string,
  patch: { name?: string; type?: FieldType; options?: Record<string, unknown>; position?: number }
) {
  const current = await db.query.fields.findFirst({ where: eq(fields.id, fieldId) }) as unknown as FieldDTO | undefined;
  if (!current) throw new Error("Field not found");

  const typeChanged = patch.type && patch.type !== current.type;
  const nextType = patch.type ?? current.type;
  const nextOptions = {
    ...(typeChanged ? FIELD_TYPE_META[nextType].defaultOptions ?? {} : current.options),
    ...(patch.options ?? {}),
  };
  const nextPatch = { ...patch, options: nextOptions };

  return db.transaction(async (tx) => {
    const updatedFields = await tx
      .update(fields)
      .set(nextPatch)
      .where(eq(fields.id, fieldId))
      .returning();
    const [field] = updatedFields as unknown as FieldDTO[];

    // On a type change, re-coerce every stored value to the new type,
    // dropping any that can't be converted. Computed target types are cleared.
    if (typeChanged) {
      const rows = await tx.query.records.findMany({
        where: eq(records.tableId, current.tableId),
      });
      for (const row of rows) {
        const cells = { ...(row.cells as Record<string, unknown>) };
        if (!(fieldId in cells)) continue;
        if (!fieldCanStoreCellValue(field)) {
          delete cells[fieldId];
        } else {
          try {
            const coerced = normalizeWritableFieldValue(field, cells[fieldId]);
            if (coerced === undefined) delete cells[fieldId];
            else cells[fieldId] = coerced;
          } catch {
            delete cells[fieldId];
          }
        }
        await tx.update(records).set({ cells }).where(eq(records.id, row.id));
      }
    }

    const rows = await tx.query.records.findMany({ where: eq(records.tableId, current.tableId) }) as unknown as RecordDTO[];
    validateExistingRowsForField(field, rows);

    return field;
  });
}

export async function previewFieldConversionForField(
  fieldId: string,
  type: FieldType,
  options: Record<string, unknown> = {}
) {
  const current = await db.query.fields.findFirst({ where: eq(fields.id, fieldId) }) as unknown as FieldDTO | undefined;
  if (!current) throw new Error("Field not found");
  const nextOptions = { ...(FIELD_TYPE_META[type].defaultOptions ?? {}), ...options };
  const rows = await db.query.records.findMany({ where: eq(records.tableId, current.tableId) }) as unknown as RecordDTO[];
  return previewFieldConversion(current, rows, type, nextOptions);
}

function validateExistingRowsForField(field: FieldDTO, rows: RecordDTO[]) {
  if (fieldIsRequired(field)) {
    const blank = rows.find((row) => isBlankValue(row.cells[field.id]));
    if (blank) throw new Error(`Field "${field.name}" has blank values and cannot be required`);
  }
  if (!fieldIsUnique(field)) return;
  const seen: unknown[] = [];
  for (const row of rows) {
    const value = row.cells[field.id];
    if (isBlankValue(value)) continue;
    if (seen.some((item) => valuesEqual(item, value))) throw new Error(`Field "${field.name}" has duplicate values`);
    seen.push(value);
  }
}

/** Reorder fields by an explicit id → position list. */
export async function reorderFields(tableId: string, order: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < order.length; i++) {
      await tx
        .update(fields)
        .set({ position: i })
        .where(eq(fields.id, order[i]));
    }
    void tableId;
  });
}

export async function deleteField(fieldId: string) {
  const field = await db.query.fields.findFirst({ where: eq(fields.id, fieldId) });
  if (!field) return;
  if (field.isPrimary) throw new Error("Cannot delete the primary field");
  // cascadeDeleteFields widens to the full closure (symmetric link partner +
  // dependent lookups/rollups) and scrubs every dangling ref in views,
  // automation triggers, link edges, and record cells.
  const { cascadeDeleteFields } = await import("@/server/services/cleanup");
  await db.transaction((tx) => cascadeDeleteFields(tx, [fieldId]));
}

export async function listFields(tableId: string) {
  return db.query.fields.findMany({
    where: eq(fields.tableId, tableId),
    orderBy: asc(fields.position),
  });
}
