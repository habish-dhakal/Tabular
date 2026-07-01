import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { fields, records, type FieldType } from "@/server/db/schema";
import { FIELD_TYPE_META, coerceCellValue, isComputed } from "@/lib/fields";

export async function createField(
  tableId: string,
  name: string,
  type: FieldType,
  options?: Record<string, unknown>
) {
  const posRow = await db
    .select({ max: sql<number>`coalesce(max(${fields.position}), -1)` })
    .from(fields)
    .where(eq(fields.tableId, tableId));
  const position = (posRow[0]?.max ?? -1) + 1;

  const defaults = FIELD_TYPE_META[type].defaultOptions ?? {};
  const [field] = await db
    .insert(fields)
    .values({ tableId, name, type, position, options: { ...defaults, ...options } })
    .returning();
  return field;
}

export async function updateField(
  fieldId: string,
  patch: { name?: string; type?: FieldType; options?: Record<string, unknown>; position?: number }
) {
  const current = await db.query.fields.findFirst({ where: eq(fields.id, fieldId) });
  if (!current) throw new Error("Field not found");

  const typeChanged = patch.type && patch.type !== current.type;

  return db.transaction(async (tx) => {
    const [field] = await tx
      .update(fields)
      .set(patch)
      .where(eq(fields.id, fieldId))
      .returning();

    // On a type change, re-coerce every stored value to the new type,
    // dropping any that can't be converted. Computed target types are cleared.
    if (typeChanged) {
      const rows = await tx.query.records.findMany({
        where: eq(records.tableId, current.tableId),
      });
      const newType = field.type;
      const newOpts = field.options as Record<string, unknown>;
      for (const row of rows) {
        const cells = { ...(row.cells as Record<string, unknown>) };
        if (!(fieldId in cells)) continue;
        if (isComputed(newType)) {
          delete cells[fieldId];
        } else {
          try {
            const coerced = coerceCellValue(newType, cells[fieldId], newOpts);
            if (coerced === undefined) delete cells[fieldId];
            else cells[fieldId] = coerced;
          } catch {
            delete cells[fieldId];
          }
        }
        await tx.update(records).set({ cells }).where(eq(records.id, row.id));
      }
    }

    return field;
  });
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
  if (field?.isPrimary) throw new Error("Cannot delete the primary field");
  await db.delete(fields).where(eq(fields.id, fieldId));
}

export async function listFields(tableId: string) {
  return db.query.fields.findMany({
    where: eq(fields.tableId, tableId),
    orderBy: asc(fields.position),
  });
}
