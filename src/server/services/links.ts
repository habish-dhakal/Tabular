import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { fields, recordLinks, records, tables } from "@/server/db/schema";
import type { FieldDTO } from "@/lib/types";

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

/**
 * Attach resolved link values to each record's `cells[linkFieldId]` as
 * LinkChip[]. Not persisted — computed for display, like formula fields.
 */
export async function enrichRecordsWithLinks(
  tableId: string,
  recs: { id: string; cells: Record<string, unknown> }[]
) {
  if (recs.length === 0) return recs;
  const linkFields = (await db.query.fields.findMany({
    where: and(eq(fields.tableId, tableId), eq(fields.type, "link")),
  })) as unknown as FieldDTO[];
  if (linkFields.length === 0) return recs;

  const recIds = recs.map((r) => r.id);

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

    // record id → linked record ids
    const byRecord = new Map<string, string[]>();
    const linkedIds = new Set<string>();
    for (const e of edges) {
      const self = reverse ? e.toRecordId : e.fromRecordId;
      const other = reverse ? e.fromRecordId : e.toRecordId;
      if (!byRecord.has(self)) byRecord.set(self, []);
      byRecord.get(self)!.push(other);
      linkedIds.add(other);
    }

    // labels from the other table's primary field
    const otherPrimary = await primaryFieldId(otherTableId);
    const labelMap = new Map<string, string>();
    if (linkedIds.size) {
      const linked = await db.query.records.findMany({ where: inArray(records.id, [...linkedIds]) });
      for (const lr of linked) labelMap.set(lr.id, labelOf(lr.cells as Record<string, unknown>, otherPrimary));
    }

    for (const r of recs) {
      const ids = byRecord.get(r.id) ?? [];
      (r.cells as Record<string, unknown>)[lf.id] = ids.map((id): LinkChip => ({ id, label: labelMap.get(id) ?? "Unnamed record" }));
    }
  }
  return recs;
}

/** Options for the link picker: candidate records in the linked table. */
export async function linkOptions(tableId: string, limit = 200): Promise<LinkChip[]> {
  const primary = await primaryFieldId(tableId);
  const recs = await db.query.records.findMany({ where: eq(records.tableId, tableId), limit });
  return recs.map((r) => ({ id: r.id, label: labelOf(r.cells as Record<string, unknown>, primary) }));
}
