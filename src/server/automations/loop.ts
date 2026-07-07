import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { fields as fieldsTable, records as recordsTable } from "@/server/db/schema";
import type { AutomationActionKind, AutomationActionType } from "@/server/db/schema";
import type { FieldDTO, FilterCondition, RecordDTO } from "@/lib/types";
import { applyFilterSort } from "@/lib/query";

/** Per-loop item cap (mirrors Airtable's Find-records default). */
export const MAX_LOOP_ITEMS = 1000;
/** Max nesting depth of loop/conditional groups (guards pathological trees). */
export const MAX_GROUP_DEPTH = 3;
/** Hard ceiling on executed leaf steps in one run (runaway backstop). */
export const MAX_RUN_STEPS = 10_000;

/** A flat action row as stored, before it's assembled into a tree. */
export interface FlatAction {
  id: string;
  kind: AutomationActionKind;
  type: AutomationActionType | null;
  parentId: string | null;
  position: number;
  config: Record<string, unknown>;
}

/** An action node with its ordered children (empty for leaf "action" nodes). */
export interface ActionNode extends FlatAction {
  children: ActionNode[];
}

/** Assemble flat action rows into an ordered tree by parentId + position. */
export function buildActionTree(rows: FlatAction[]): ActionNode[] {
  const byId = new Map<string, ActionNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots: ActionNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: ActionNode[]) => {
    nodes.sort((a, b) => a.position - b.position);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Where a loop draws its items from (already interpolated by the runner). */
export type LoopSource =
  | { kind: "query"; tableId: string; conjunction?: "and" | "or"; conditions?: FilterCondition[] }
  | { kind: "linkField"; fieldId: string };

export interface ResolvedItems {
  items: RecordDTO[];
  /** Fields of the looped table — the interpolation context for `{{item.*}}`. */
  fields: FieldDTO[];
  /** True when the source produced more than MAX_LOOP_ITEMS (list was capped). */
  truncated: boolean;
}

async function tableFields(tableId: string): Promise<FieldDTO[]> {
  const rows = await db.query.fields.findMany({
    where: eq(fieldsTable.tableId, tableId),
    orderBy: asc(fieldsTable.position),
  });
  return rows as unknown as FieldDTO[];
}

/**
 * Resolve a loop's item list. `query` runs a Find-records-style filter over a
 * table; `linkField` iterates the trigger record's linked records. Both cap at
 * MAX_LOOP_ITEMS. `triggerFields`/`triggerCells` describe the trigger record
 * (used only by the `linkField` source).
 */
export async function resolveLoopItems(
  source: LoopSource,
  triggerFields: FieldDTO[],
  triggerCells: Record<string, unknown>
): Promise<ResolvedItems> {
  if (source.kind === "query") {
    const fields = await tableFields(source.tableId);
    const rows = (await db.query.records.findMany({
      where: eq(recordsTable.tableId, source.tableId),
      orderBy: asc(recordsTable.position),
    })) as unknown as RecordDTO[];
    const filtered = applyFilterSort(rows, fields, {
      filters: { conjunction: source.conjunction ?? "and", conditions: source.conditions ?? [] },
    } as Parameters<typeof applyFilterSort>[2]);
    return { items: filtered.slice(0, MAX_LOOP_ITEMS), fields, truncated: filtered.length > MAX_LOOP_ITEMS };
  }

  // linkField: read the trigger record's link cell → fetch those records.
  const field = triggerFields.find((f) => f.id === source.fieldId);
  const linkedTableId = field?.options?.linkedTableId as string | undefined;
  if (!field || !linkedTableId) return { items: [], fields: [], truncated: false };
  const chips = Array.isArray(triggerCells[source.fieldId])
    ? (triggerCells[source.fieldId] as { id: string }[])
    : [];
  const ids = chips.map((c) => c.id).filter(Boolean);
  const fields = await tableFields(linkedTableId);
  if (ids.length === 0) return { items: [], fields, truncated: false };
  const rows = (await db.query.records.findMany({
    where: inArray(recordsTable.id, ids.slice(0, MAX_LOOP_ITEMS)),
  })) as unknown as RecordDTO[];
  // Preserve the link cell's order (findMany order isn't guaranteed).
  const order = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { items: rows, fields, truncated: ids.length > MAX_LOOP_ITEMS };
}
