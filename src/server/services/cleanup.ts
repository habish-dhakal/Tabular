import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { automations, fields, recordLinks, records, tables, views } from "@/server/db/schema";
import { closeFieldDeletion, scrubTriggerConfig, scrubViewConfig } from "@/lib/cleanup-refs";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Delete a set of fields and clean up every dangling reference to them within
 * the same base — the sweep foreign keys can't do because the refs live inside
 * JSONB. Given seed field ids it:
 *   1. widens the set to the full deletion closure (dependent lookups/rollups +
 *      symmetric link partners — see `closeFieldDeletion`),
 *   2. removes link edges for any dead link relationship,
 *   3. deletes the field rows,
 *   4. scrubs the dead ids out of sibling view configs + automation triggers,
 *   5. drops the dead field keys from every affected record's `cells`.
 * Runs inside the caller's transaction so a partial cleanup can't be committed.
 */
export async function cascadeDeleteFields(tx: Tx, seedFieldIds: string[]): Promise<void> {
  if (!seedFieldIds.length) return;

  // Refs only reach across tables within one base (links can't cross bases), so
  // resolve the base from a seed field and scope every load to it.
  const seed = await tx.query.fields.findMany({
    where: inArray(fields.id, seedFieldIds),
    columns: { tableId: true },
  });
  if (!seed.length) return;
  const seedTable = await tx.query.tables.findFirst({
    where: eq(tables.id, seed[0].tableId),
    columns: { baseId: true },
  });
  if (!seedTable) return;

  const baseTables = await tx.query.tables.findMany({
    where: eq(tables.baseId, seedTable.baseId),
    columns: { id: true },
  });
  const tableIds = baseTables.map((t) => t.id);
  if (!tableIds.length) return;

  const allFields = await tx.query.fields.findMany({ where: inArray(fields.tableId, tableIds) });
  const dead = closeFieldDeletion(allFields, seedFieldIds);
  if (!dead.size) return;
  const deadIds = [...dead];

  // 1. Link edges are keyed by the relationship (owner field) id — remove them
  //    for any dead link field before the field row goes.
  const deadLinkRels = allFields
    .filter((f) => dead.has(f.id) && f.type === "link")
    .map((f) => ((f.options as Record<string, unknown>)?.relationshipId as string) ?? f.id);
  const rels = [...new Set(deadLinkRels)];
  if (rels.length) await tx.delete(recordLinks).where(inArray(recordLinks.fieldId, rels));

  // 2. Delete the field rows.
  await tx.delete(fields).where(inArray(fields.id, deadIds));

  // 3. Scrub view configs.
  const baseViews = await tx.query.views.findMany({ where: inArray(views.tableId, tableIds) });
  for (const v of baseViews) {
    const { config, changed } = scrubViewConfig(v.config, dead);
    if (changed) await tx.update(views).set({ config }).where(eq(views.id, v.id));
  }

  // 4. Scrub automation trigger configs.
  const baseAutos = await tx.query.automations.findMany({ where: inArray(automations.tableId, tableIds) });
  for (const a of baseAutos) {
    const { config, changed } = scrubTriggerConfig(a.triggerType, a.triggerConfig, dead);
    if (changed) await tx.update(automations).set({ triggerConfig: config }).where(eq(automations.id, a.id));
  }

  // 5. Drop the dead field keys from every affected record's cells JSONB
  //    (`cells - 'fld_a' - 'fld_b' …`).
  const affectedTables = [...new Set(allFields.filter((f) => dead.has(f.id)).map((f) => f.tableId))];
  if (affectedTables.length) {
    let expr: SQL = sql`${records.cells}`;
    for (const k of deadIds) expr = sql`${expr} - ${k}`;
    await tx
      .update(records)
      .set({ cells: expr as unknown as Record<string, unknown> })
      .where(inArray(records.tableId, affectedTables));
  }
}

/**
 * External link fields (in other tables of the same base) whose partner lives
 * in the table being deleted. Their partners cascade with the table, but the
 * external side — and any lookup/rollup riding on it — would dangle.
 */
export async function externalLinkFieldsInto(tx: Tx, tableId: string): Promise<string[]> {
  const tbl = await tx.query.tables.findFirst({
    where: eq(tables.id, tableId),
    columns: { baseId: true },
  });
  if (!tbl) return [];
  const baseTables = await tx.query.tables.findMany({
    where: eq(tables.baseId, tbl.baseId),
    columns: { id: true },
  });
  const linkFields = await tx.query.fields.findMany({
    where: and(inArray(fields.tableId, baseTables.map((t) => t.id)), eq(fields.type, "link")),
  });
  return linkFields
    .filter((f) => f.tableId !== tableId && (f.options as Record<string, unknown>)?.linkedTableId === tableId)
    .map((f) => f.id);
}
