import type { FieldType } from "@/server/db/schema";
import type {
  FieldDTO,
  FilterCondition,
  FilterOp,
  RecordDTO,
  SortRule,
  ViewConfig,
} from "@/lib/types";
import { ValueResolver, isBlankValue } from "@/lib/value-resolver";

export type FieldCategory =
  | "text"
  | "number"
  | "boolean"
  | "singleSelect"
  | "multiSelect"
  | "date"
  | "other";

export function fieldCategory(type: FieldType): FieldCategory {
  switch (type) {
    case "singleLineText":
    case "longText":
    case "url":
    case "email":
    case "phone":
    case "user":
      return "text";
    case "number":
    case "currency":
    case "percent":
    case "rating":
    case "autoNumber":
    case "duration":
    case "count":
      return "number";
    case "checkbox":
      return "boolean";
    case "singleSelect":
      return "singleSelect";
    case "multiSelect":
      return "multiSelect";
    case "date":
    case "dateTime":
    case "createdTime":
    case "updatedTime":
      return "date";
    default:
      return "other";
  }
}

export const OP_LABELS: Record<FilterOp, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  doesNotContain: "does not contain",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  eq: "=",
  neq: "≠",
  lt: "<",
  lte: "≤",
  gt: ">",
  gte: "≥",
  isAnyOf: "is any of",
  isNoneOf: "is none of",
  hasAnyOf: "has any of",
  hasAllOf: "has all of",
  hasNoneOf: "has none of",
  isBefore: "is before",
  isAfter: "is after",
  isOnOrBefore: "is on or before",
  isOnOrAfter: "is on or after",
};

const EMPTY_OPS: FilterOp[] = ["isEmpty", "isNotEmpty"];

export const OPS_BY_CATEGORY: Record<FieldCategory, FilterOp[]> = {
  text: ["is", "isNot", "contains", "doesNotContain", ...EMPTY_OPS],
  number: ["eq", "neq", "lt", "lte", "gt", "gte", ...EMPTY_OPS],
  boolean: ["is"],
  singleSelect: ["is", "isNot", "isAnyOf", "isNoneOf", ...EMPTY_OPS],
  multiSelect: ["hasAnyOf", "hasAllOf", "hasNoneOf", ...EMPTY_OPS],
  date: ["is", "isBefore", "isAfter", "isOnOrBefore", "isOnOrAfter", ...EMPTY_OPS],
  other: [...EMPTY_OPS],
};

/** Evaluate a single filter condition against a cell value. */
export function evaluateCondition(
  field: FieldDTO,
  cell: unknown,
  op: FilterOp,
  target: unknown
): boolean {
  return new ValueResolver([field]).evaluateCondition(field, cell, op, target);
}

/** Evaluate a condition against a full record so computed fields resolve first. */
export function evaluateRecordCondition(
  field: FieldDTO,
  record: RecordDTO,
  fields: FieldDTO[],
  op: FilterOp,
  target: unknown
): boolean {
  return new ValueResolver(fields).evaluateCondition(field, record, op, target);
}

function matchesFilters(
  record: RecordDTO,
  fieldsById: Map<string, FieldDTO>,
  filters: ViewConfig["filters"]
): boolean {
  if (!filters || filters.conditions.length === 0) return true;
  const resolver = new ValueResolver([...fieldsById.values()]);
  const results = filters.conditions.map((c: FilterCondition) => {
    const field = fieldsById.get(c.fieldId);
    if (!field) return true;
    return resolver.evaluateCondition(field, record, c.op, c.value);
  });
  return filters.conjunction === "or" ? results.some(Boolean) : results.every(Boolean);
}

/** Comparator for sorting by a field. Blanks sort last. */
export function compareByField(field: FieldDTO, a: unknown, b: unknown): number {
  return new ValueResolver([field]).compareFieldValues(field, a, b);
}

function applySorts(
  records: RecordDTO[],
  fieldsById: Map<string, FieldDTO>,
  sorts: SortRule[] | undefined
): RecordDTO[] {
  if (!sorts || sorts.length === 0) return records;
  const resolver = new ValueResolver([...fieldsById.values()]);
  return [...records].sort((r1, r2) => {
    for (const s of sorts) {
      const field = fieldsById.get(s.fieldId);
      if (!field) continue;
      const cmp = resolver.compareRecordsByField(field, r1, r2);
      if (cmp !== 0) return s.direction === "desc" ? -cmp : cmp;
    }
    return r1.position - r2.position;
  });
}

export interface RecordGroup {
  key: string;
  value: unknown;
  records: RecordDTO[];
}

/** Apply filters + sorts to a record set. */
export function applyFilterSort(
  records: RecordDTO[],
  fields: FieldDTO[],
  config: ViewConfig
): RecordDTO[] {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const filtered = records.filter((r) => matchesFilters(r, byId, config.filters));
  return applySorts(filtered, byId, config.sorts);
}

/** Group an already-filtered/sorted record set by a field. */
export function groupRecords(
  records: RecordDTO[],
  groupField: FieldDTO | undefined
): RecordGroup[] {
  if (!groupField) return [{ key: "__all__", value: null, records }];
  const map = new Map<string, RecordGroup>();
  for (const r of records) {
    const raw = r.cells[groupField.id];
    const key = isBlankValue(raw) ? "__empty__" : String(raw);
    if (!map.has(key)) {
      map.set(key, { key, value: isBlankValue(raw) ? null : raw, records: [] });
    }
    map.get(key)!.records.push(r);
  }
  return [...map.values()];
}
