/**
 * Pure reference-scrubbing helpers for cascade cleanup on field/table delete.
 *
 * Field and table ids are referenced as plain strings inside JSONB blobs
 * (view `config`, automation `triggerConfig`, sibling field `options`) that no
 * foreign key can reach. When a field is deleted these turn into dangling refs:
 * views sort/group/filter on a ghost, lookups/rollups compute against a gone
 * source, triggers watch a field that no longer exists.
 *
 * These functions are dependency-free (no DB) so the logic suite can exercise
 * every branch; the service layer (`services/cleanup.ts`) resolves the actual
 * rows and applies the results in a transaction.
 */

type Options = Record<string, unknown> | null | undefined;
interface FieldLike {
  id: string;
  options: Options;
}

/**
 * Given every field in a base and a seed set of ids being deleted, return the
 * full transitive set that must go with them:
 *  - lookup/rollup fields whose `linkFieldId` or `targetFieldId` points at a
 *    dead field (they're meaningless without their source),
 *  - the symmetric partner of any dead link field (`symmetricFieldId`, mutual).
 * Iterated to a fixpoint so chains (delete link → its lookup → …) are caught.
 */
export function closeFieldDeletion(allFields: FieldLike[], seedIds: string[]): Set<string> {
  const dead = new Set(seedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of allFields) {
      if (dead.has(f.id)) continue;
      const o = (f.options ?? {}) as Record<string, unknown>;
      if (
        dead.has(o.linkFieldId as string) ||
        dead.has(o.targetFieldId as string) ||
        dead.has(o.symmetricFieldId as string)
      ) {
        dead.add(f.id);
        changed = true;
      }
    }
  }
  return dead;
}

interface FilterCondition {
  fieldId?: string;
  [k: string]: unknown;
}

/**
 * Remove every reference to a dead field id from a view's `config`. Returns the
 * cleaned config and whether anything changed (so the caller can skip a no-op
 * write). Does not mutate the input.
 */
export function scrubViewConfig(
  config: Record<string, unknown>,
  dead: Set<string>
): { config: Record<string, unknown>; changed: boolean } {
  const next: Record<string, unknown> = { ...config };
  let changed = false;
  const isDead = (v: unknown) => typeof v === "string" && dead.has(v);

  // filters.conditions[].fieldId
  const filters = next.filters as { conjunction?: string; conditions?: FilterCondition[] } | undefined;
  if (filters?.conditions?.length) {
    const kept = filters.conditions.filter((c) => !isDead(c.fieldId));
    if (kept.length !== filters.conditions.length) {
      next.filters = { ...filters, conditions: kept };
      changed = true;
    }
  }

  // sorts[].fieldId
  const sorts = next.sorts as { fieldId?: string }[] | undefined;
  if (Array.isArray(sorts)) {
    const kept = sorts.filter((s) => !isDead(s.fieldId));
    if (kept.length !== sorts.length) {
      next.sorts = kept;
      changed = true;
    }
  }

  // groupBy: fieldId | null
  if (isDead(next.groupBy)) {
    next.groupBy = null;
    changed = true;
  }

  // hiddenFieldIds[] and fieldOrder[]
  for (const key of ["hiddenFieldIds", "fieldOrder"] as const) {
    const arr = next[key] as string[] | undefined;
    if (Array.isArray(arr)) {
      const kept = arr.filter((id) => !dead.has(id));
      if (kept.length !== arr.length) {
        next[key] = kept;
        changed = true;
      }
    }
  }

  // fieldWidths: Record<fieldId, number>
  const widths = next.fieldWidths as Record<string, number> | undefined;
  if (widths && typeof widths === "object") {
    const cleaned: Record<string, number> = {};
    let dropped = false;
    for (const [k, v] of Object.entries(widths)) {
      if (dead.has(k)) dropped = true;
      else cleaned[k] = v;
    }
    if (dropped) {
      next.fieldWidths = cleaned;
      changed = true;
    }
  }

  // kanban.stackFieldId / calendar.dateFieldId
  for (const [key, prop] of [
    ["kanban", "stackFieldId"],
    ["calendar", "dateFieldId"],
  ] as const) {
    const sub = next[key] as Record<string, unknown> | undefined;
    if (sub && isDead(sub[prop])) {
      next[key] = { ...sub, [prop]: null };
      changed = true;
    }
  }

  return { config: next, changed };
}

/**
 * Remove references to dead field ids from an automation's `triggerConfig`.
 * Only field-id-bearing trigger types carry refs:
 *  - recordUpdated (watch:"fields"): prune `fieldIds`,
 *  - recordMatchesCondition / recordEntersCondition: prune `conditions[].fieldId`.
 */
export function scrubTriggerConfig(
  triggerType: string,
  config: Record<string, unknown>,
  dead: Set<string>
): { config: Record<string, unknown>; changed: boolean } {
  const next: Record<string, unknown> = { ...config };
  let changed = false;

  if (triggerType === "recordUpdated" && next.watch === "fields" && Array.isArray(next.fieldIds)) {
    const kept = (next.fieldIds as string[]).filter((id) => !dead.has(id));
    if (kept.length !== (next.fieldIds as string[]).length) {
      next.fieldIds = kept;
      changed = true;
    }
  }

  if (triggerType === "recordMatchesCondition" || triggerType === "recordEntersCondition") {
    const conds = next.conditions as FilterCondition[] | undefined;
    if (Array.isArray(conds)) {
      const kept = conds.filter((c) => !(typeof c.fieldId === "string" && dead.has(c.fieldId)));
      if (kept.length !== conds.length) {
        next.conditions = kept;
        changed = true;
      }
    }
  }

  return { config: next, changed };
}
