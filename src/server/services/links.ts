import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { fields, recordLinks, records, tables } from "@/server/db/schema";
import { emitChangeEvent } from "@/server/automations/emit";
import type { FieldDTO, RecordDTO } from "@/lib/types";
import { ValueResolver } from "@/lib/value-resolver";

/**
 * Linked records model.
 *
 * A `link` field connects records in one table to records in another. Creating
 * one makes a *pair* of fields: the owner (on the origin table) and a symmetric
 * reverse field (on the target table). Both describe the same relationship.
 *
 * Edges live in `record_link` keyed by `fieldId = relationshipId` (the owner
 * field's id). The owner reads from→to; the reverse reads to→from. This way a
 * single edge set stays consistent from both sides.
 *
 * Field.options:
 *   owner:   { linkedTableId, allowMultiple, relationshipId, symmetricFieldId }
 *   reverse: { linkedTableId, allowMultiple, relationshipId, symmetricFieldId, reverse: true }
 */

export interface LinkChip { id: string; label: string }

function labelOf(cells: Record<string, unknown>, primaryFieldId: string | undefined): string {
  const v = primaryFieldId ? cells[primaryFieldId] : undefined;
  return v === undefined || v === null || v === "" ? "Unnamed record" : String(v);
}

async function primaryFieldId(tableId: string): Promise<string | undefined> {
  const f = await db.query.fields.findFirst({
    where: and(eq(fields.tableId, tableId), eq(fields.isPrimary, true)),
  });
  return f?.id;
}

/** Create the owner + symmetric reverse link fields in one transaction. */
export async function createLinkField(
  tableId: string,
  name: string,
  linkedTableId: string,
  allowMultiple: boolean
) {
  return db.transaction(async (tx) => {
    const nextPos = async (tid: string) => {
      const rows = await tx.query.fields.findMany({ where: eq(fields.tableId, tid) });
      return rows.reduce((m, f) => Math.max(m, f.position), -1) + 1;
    };

    // Owner first (its id becomes the relationship id).
    const [owner] = await tx
      .insert(fields)
      .values({
        tableId,
        name,
        type: "link",
        position: await nextPos(tableId),
        options: { linkedTableId, allowMultiple },
      })
      .returning();

    const originTable = await tx.query.tables.findFirst({ where: eq(tables.id, tableId) });

    const [reverse] = await tx
      .insert(fields)
      .values({
        tableId: linkedTableId,
        name: `${originTable?.name ?? "Linked"} (${name})`,
        type: "link",
        position: await nextPos(linkedTableId),
        options: {
          linkedTableId: tableId,
          allowMultiple: true,
          relationshipId: owner.id,
          symmetricFieldId: owner.id,
          reverse: true,
        },
      })
      .returning();

    const [updatedOwner] = await tx
      .update(fields)
      .set({ options: { linkedTableId, allowMultiple, relationshipId: owner.id, symmetricFieldId: reverse.id } })
      .where(eq(fields.id, owner.id))
      .returning();

    return updatedOwner;
  });
}

/** Is this a reverse (symmetric) link field? */
function isReverse(field: FieldDTO): boolean {
  return field.options.reverse === true;
}
function relationshipId(field: FieldDTO): string {
  return (field.options.relationshipId as string) ?? field.id;
}

/** Replace the links for one record on one link field. */
export async function setLinks(field: FieldDTO, recordId: string, targetIds: string[]) {
  const rel = relationshipId(field);
  const reverse = isReverse(field);
  const allowMultiple = field.options.allowMultiple !== false;
  const ids = allowMultiple ? [...new Set(targetIds)] : targetIds.slice(0, 1);

  await db.transaction(async (tx) => {
    if (reverse) {
      // This record is the "to" side; edges are (from=target, to=record).
      await tx.delete(recordLinks).where(and(eq(recordLinks.fieldId, rel), eq(recordLinks.toRecordId, recordId)));
      if (ids.length)
        await tx.insert(recordLinks).values(ids.map((t) => ({ fieldId: rel, fromRecordId: t, toRecordId: recordId })));
    } else {
      await tx.delete(recordLinks).where(and(eq(recordLinks.fieldId, rel), eq(recordLinks.fromRecordId, recordId)));
      if (ids.length)
        await tx.insert(recordLinks).values(ids.map((t) => ({ fieldId: rel, fromRecordId: recordId, toRecordId: t })));
    }
  });

  // Lightweight change event so recordUpdated triggers can react to link edits.
  // Limitation (v1): link edges aren't stored in `records.cells`, so before/after
  // carry only the record's *stored* cell values (unchanged here); the changed
  // field is signalled via changedFieldIds. Only the edited (primary) side is
  // emitted — the symmetric reverse record gets no event, and there's no userId.
  const stored = ((await db.query.records.findFirst({ where: eq(records.id, recordId) }))?.cells ??
    {}) as Record<string, unknown>;
  emitChangeEvent({
    kind: "record.updated",
    tableId: field.tableId,
    recordId,
    before: stored,
    after: stored,
    changedFieldIds: [field.id],
  });
}

/** Delete a link field and its symmetric partner (edges cascade via fieldId). */
export async function deleteLinkPair(field: FieldDTO) {
  const rel = relationshipId(field);
  const symId = field.options.symmetricFieldId as string | undefined;
  await db.transaction(async (tx) => {
    // Edges are keyed by the owner field id (rel); deleting it cascades them.
    await tx.delete(recordLinks).where(eq(recordLinks.fieldId, rel));
    const ids = [field.id, symId].filter(Boolean) as string[];
    if (ids.length) await tx.delete(fields).where(inArray(fields.id, ids));
  });
}

const ROLLUP_FNS = ["COUNT", "SUM", "AVERAGE", "MIN", "MAX", "CONCAT"] as const;
export type RollupFn = (typeof ROLLUP_FNS)[number];

function aggregate(fn: string, values: (string | number | boolean | null)[], linkedCount: number) {
  const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
  switch (fn) {
    case "COUNT": return linkedCount;
    case "SUM": return nums.reduce((a, b) => a + b, 0);
    case "AVERAGE": return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case "MIN": return nums.length ? Math.min(...nums) : null;
    case "MAX": return nums.length ? Math.max(...nums) : null;
    case "CONCAT": return values.filter((v) => v !== null && v !== "").map(String).join(", ");
    default: return null;
  }
}

/**
 * Attach computed values to each record's cells for display (not persisted):
 *  - link:   cells[fieldId] = LinkChip[]
 *  - lookup: cells[fieldId] = value[]  (pulled from linked records)
 *  - rollup: cells[fieldId] = aggregate over linked records
 *  - count:  cells[fieldId] = linked record count
 */
export async function enrichRecords(
  tableId: string,
  recs: { id: string; cells: Record<string, unknown> }[]
) {
  if (recs.length === 0) return recs;
  const allFields = (await db.query.fields.findMany({ where: eq(fields.tableId, tableId) })) as unknown as FieldDTO[];
  const linkFields = allFields.filter((f) => f.type === "link");
  const refFields = allFields.filter((f) => f.type === "lookup" || f.type === "rollup" || f.type === "count");
  if (linkFields.length === 0 && refFields.length === 0) return recs;

  const recIds = recs.map((r) => r.id);
  // per link field: recordId → linked record ids
  const linkedIdsByField = new Map<string, Map<string, string[]>>();

  for (const lf of linkFields) {
    const rel = relationshipId(lf);
    const reverse = isReverse(lf);
    const otherTableId = lf.options.linkedTableId as string;

    const edges = await db.query.recordLinks.findMany({
      where: and(
        eq(recordLinks.fieldId, rel),
        reverse ? inArray(recordLinks.toRecordId, recIds) : inArray(recordLinks.fromRecordId, recIds)
      ),
    });

    const byRecord = new Map<string, string[]>();
    const linkedIds = new Set<string>();
    for (const e of edges) {
      const self = reverse ? e.toRecordId : e.fromRecordId;
      const other = reverse ? e.fromRecordId : e.toRecordId;
      if (!byRecord.has(self)) byRecord.set(self, []);
      byRecord.get(self)!.push(other);
      linkedIds.add(other);
    }
    linkedIdsByField.set(lf.id, byRecord);

    const otherPrimary = await primaryFieldId(otherTableId);
    const labelMap = new Map<string, string>();
    if (linkedIds.size) {
      const linked = await db.query.records.findMany({ where: inArray(records.id, [...linkedIds]) });
      for (const lr of linked) labelMap.set(lr.id, labelOf(lr.cells as Record<string, unknown>, otherPrimary));
    }
    for (const r of recs) {
      const ids = byRecord.get(r.id) ?? [];
      r.cells[lf.id] = ids.map((id): LinkChip => ({ id, label: labelMap.get(id) ?? "Unnamed record" }));
    }
  }

  // lookup / rollup / count over the resolved edges
  for (const cf of refFields) {
    const linkFieldId = cf.options.linkFieldId as string | undefined;
    const targetFieldId = cf.options.targetFieldId as string | undefined;
    const lf = linkFields.find((f) => f.id === linkFieldId);
    if (!lf || (!targetFieldId && cf.type !== "count")) {
      for (const r of recs) r.cells[cf.id] = cf.type === "lookup" ? [] : cf.type === "count" ? 0 : null;
      continue;
    }

    const byRecord = linkedIdsByField.get(lf.id) ?? new Map();
    if (cf.type === "count") {
      for (const r of recs) r.cells[cf.id] = (byRecord.get(r.id) ?? []).length;
      continue;
    }
    const targetTableId = lf.options.linkedTableId as string;
    const targetId = targetFieldId as string;
    const targetField = (await db.query.fields.findFirst({ where: eq(fields.id, targetId) })) as unknown as FieldDTO | undefined;
    const targetFields = (await db.query.fields.findMany({ where: eq(fields.tableId, targetTableId) })) as unknown as FieldDTO[];
    const resolver = new ValueResolver(targetFields);

    const allIds = [...new Set([...byRecord.values()].flat())];
    const valueById = new Map<string, string | number | boolean | null>();
    if (allIds.length) {
      const linked = await db.query.records.findMany({ where: inArray(records.id, allIds) });
      for (const lr of linked) {
        const record = lr as unknown as RecordDTO;
        const value = targetField ? resolver.resolveField(targetField, record, "export") : null;
        valueById.set(
          lr.id,
          value === undefined || value === null
            ? null
            : Array.isArray(value)
              ? value.map(String).join(", ")
              : (value as string | number | boolean)
        );
      }
    }

    for (const r of recs) {
      const ids: string[] = byRecord.get(r.id) ?? [];
      const values = ids.map((id) => valueById.get(id) ?? null);
      if (cf.type === "lookup") {
        r.cells[cf.id] = values.filter((v) => v !== null && v !== "");
      } else {
        r.cells[cf.id] = aggregate((cf.options.fn as string) ?? "COUNT", values, ids.length);
      }
    }
  }

  return recs;
}

/** @deprecated use enrichRecords */
export const enrichRecordsWithLinks = enrichRecords;

/** Options for the link picker: candidate records in the linked table. */
export async function linkOptions(tableId: string, limit = 200): Promise<LinkChip[]> {
  const primary = await primaryFieldId(tableId);
  const recs = await db.query.records.findMany({ where: eq(records.tableId, tableId), limit });
  return recs.map((r) => ({ id: r.id, label: labelOf(r.cells as Record<string, unknown>, primary) }));
}
