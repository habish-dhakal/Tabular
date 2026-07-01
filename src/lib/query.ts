import type { FieldType } from "@/server/db/schema";
import type {
  FieldDTO,
  FilterCondition,
  FilterOp,
  RecordDTO,
  SortRule,
  ViewConfig,
} from "@/lib/types";

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

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === "" ||
    (Array.isArray(v) && v.length === 0);
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (isBlank(v)) return [];
  return [String(v)];
}

/** Evaluate a single filter condition against a cell value. */
export function evaluateCondition(
  field: FieldDTO,
  cell: unknown,
  op: FilterOp,
  target: unknown
): boolean {
  if (op === "isEmpty") return isBlank(cell);
  if (op === "isNotEmpty") return !isBlank(cell);

  const cat = fieldCategory(field.type);

  switch (cat) {
    case "text": {
      const a = isBlank(cell) ? "" : String(cell).toLowerCase();
      const b = isBlank(target) ? "" : String(target).toLowerCase();
      if (op === "is") return a === b;
      if (op === "isNot") return a !== b;
      if (op === "contains") return a.includes(b);
      if (op === "doesNotContain") return !a.includes(b);
      return true;
    }
    case "number": {
      if (isBlank(cell)) return false;
      const a = Number(cell);
      const b = Number(target);
      if (Number.isNaN(b)) return true;
      switch (op) {
        case "eq": return a === b;
        case "neq": return a !== b;
        case "lt": return a < b;
        case "lte": return a <= b;
        case "gt": return a > b;
        case "gte": return a >= b;
        default: return true;
      }
    }
    case "boolean": {
      const a = Boolean(cell);
      const b = Boolean(target);
      return a === b;
    }
    case "singleSelect": {
      const a = isBlank(cell) ? "" : String(cell);
      if (op === "is") return a === String(target);
      if (op === "isNot") return a !== String(target);
      if (op === "isAnyOf") return asArray(target).includes(a);
      if (op === "isNoneOf") return !asArray(target).includes(a);
      return true;
    }
    case "multiSelect": {
      const a = asArray(cell);
      const b = asArray(target);
      if (op === "hasAnyOf") return b.some((x) => a.includes(x));
      if (op === "hasAllOf") return b.every((x) => a.includes(x));
      if (op === "hasNoneOf") return !b.some((x) => a.includes(x));
      return true;
    }
    case "date": {
      if (isBlank(cell)) return false;
      const a = new Date(cell as string).getTime();
      const b = target ? new Date(target as string).getTime() : NaN;
      if (Number.isNaN(b)) return true;
      const sameDay = new Date(a).toDateString() === new Date(b).toDateString();
      switch (op) {
        case "is": return sameDay;
        case "isBefore": return a < b && !sameDay;
        case "isAfter": return a > b && !sameDay;
        case "isOnOrBefore": return a <= b || sameDay;
        case "isOnOrAfter": return a >= b || sameDay;
        default: return true;
      }
    }
    default:
      return true;
  }
}

function matchesFilters(
  record: RecordDTO,
  fieldsById: Map<string, FieldDTO>,
  filters: ViewConfig["filters"]
): boolean {
  if (!filters || filters.conditions.length === 0) return true;
  const results = filters.conditions.map((c: FilterCondition) => {
    const field = fieldsById.get(c.fieldId);
    if (!field) return true;
    return evaluateCondition(field, record.cells[c.fieldId], c.op, c.value);
  });
  return filters.conjunction === "or" ? results.some(Boolean) : results.every(Boolean);
}

/** Comparator for sorting by a field. Blanks sort last. */
export function compareByField(field: FieldDTO, a: unknown, b: unknown): number {
  const ba = isBlank(a);
  const bb = isBlank(b);
  if (ba && bb) return 0;
  if (ba) return 1;
  if (bb) return -1;

  const cat = fieldCategory(field.type);
  if (cat === "number") return Number(a) - Number(b);
  if (cat === "date") return new Date(a as string).getTime() - new Date(b as string).getTime();
  if (cat === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  if (cat === "singleSelect") {
    // sort by choice order
    const choices = (field.options.choices as { id: string }[]) ?? [];
    const ia = choices.findIndex((c) => c.id === a);
    const ib = choices.findIndex((c) => c.id === b);
    return ia - ib;
  }
  return String(a).localeCompare(String(b));
}

function applySorts(
  records: RecordDTO[],
  fieldsById: Map<string, FieldDTO>,
  sorts: SortRule[] | undefined
): RecordDTO[] {
  if (!sorts || sorts.length === 0) return records;
  return [...records].sort((r1, r2) => {
    for (const s of sorts) {
      const field = fieldsById.get(s.fieldId);
      if (!field) continue;
      const cmp = compareByField(field, r1.cells[s.fieldId], r2.cells[s.fieldId]);
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
    const key = isBlank(raw) ? "__empty__" : String(raw);
    if (!map.has(key)) {
      map.set(key, { key, value: isBlank(raw) ? null : raw, records: [] });
    }
    map.get(key)!.records.push(r);
  }
  return [...map.values()];
}
