import { normalizeAttachmentValue } from "@/lib/attachments";
import { evaluateFormula, type FormulaValue } from "@/lib/formula";
import type { FieldDTO, FilterOp, RecordDTO } from "@/lib/types";
import type { FieldType } from "@/server/db/schema";

type SelectChoice = { id: string; name: string; color: string };

export type ValueForm =
  | "raw"
  | "normalized"
  | "display"
  | "query"
  | "computed"
  | "export"
  | "import"
  | "automationToken";

export type LinkValue = { id: string; label: string };

export function isBlankValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (isBlankValue(value)) return [];
  return [String(value)];
}

function choicesOf(field: FieldDTO): SelectChoice[] {
  return (field.options.choices as SelectChoice[]) ?? [];
}

function choiceName(field: FieldDTO, id: unknown): string {
  return choicesOf(field).find((choice) => choice.id === id)?.name ?? String(id);
}

function linkLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as LinkValue[]).map((chip) => chip.label ?? chip.id).filter(Boolean);
}

function stableAutoNumber(recordId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < recordId.length; i++) {
    hash ^= recordId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1_000_000) + 1;
}

function looksLikeDate(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  return !Number.isNaN(new Date(value).getTime());
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).toLowerCase();
  return !(s === "false" || s === "0" || s === "no" || s === "off");
}

function parseDurationSeconds(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw new Error("Invalid duration");
    return Math.round(value);
  }
  const s = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s));
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(":").map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  throw new Error("Invalid duration");
}

function recordWithCells(cells: Record<string, unknown>): RecordDTO {
  return {
    id: "rec_context",
    tableId: "tbl_context",
    cells,
    position: 0,
    createdAt: "",
    updatedAt: "",
  };
}

export class ValueResolver {
  private readonly fieldsById: Map<string, FieldDTO>;
  private readonly fieldsByName: Map<string, FieldDTO>;

  constructor(private readonly fields: FieldDTO[]) {
    this.fieldsById = new Map(fields.map((field) => [field.id, field]));
    this.fieldsByName = new Map(fields.map((field) => [field.name.toLowerCase(), field]));
  }

  resolveField(field: FieldDTO, record: RecordDTO, form: ValueForm = "display"): unknown {
    const raw = record.cells[field.id];
    if (form === "raw") return raw;

    const computed = this.computedValue(field, record);
    if (form === "computed") return computed;

    if (form === "normalized" || form === "import") {
      if (this.isComputedField(field)) return computed;
      return normalizeFieldValue(field.type, raw, field.options);
    }

    if (form === "query") return this.toQueryValue(field, computed);
    if (form === "automationToken") return this.toAutomationToken(field, computed);
    if (form === "export") return this.toExportValue(field, computed);
    return computed;
  }

  normalize(field: FieldDTO, value: unknown): unknown {
    return normalizeFieldValue(field.type, value, field.options);
  }

  computedValue(field: FieldDTO, record: RecordDTO, seen: Set<string> = new Set()): unknown {
    const hasProjectedValue = Object.prototype.hasOwnProperty.call(record.cells, field.id);
    switch (field.type) {
      case "formula": {
        if (hasProjectedValue) return record.cells[field.id];
        const expr = (field.options.expression as string) ?? "";
        if (!expr.trim()) return null;
        if (seen.has(field.id)) return "#CYCLE";
        seen.add(field.id);
        const result = evaluateFormula(expr, (name) => {
          const ref = this.fieldsByName.get(name.toLowerCase());
          if (!ref) return null;
          const refValue = this.computedValue(ref, record, seen);
          return this.toFormulaValue(ref, refValue);
        });
        seen.delete(field.id);
        return result;
      }
      case "createdTime":
        return record.createdAt ?? null;
      case "updatedTime":
        return record.updatedAt ?? null;
      case "createdBy":
        return record.createdBy ?? null;
      case "updatedBy":
        return record.updatedBy ?? null;
      case "autoNumber": {
        const stored = record.cells[field.id];
        const n = Number(stored);
        return Number.isFinite(n) && n > 0 ? n : stableAutoNumber(record.id);
      }
      case "lookup":
      case "rollup":
        return record.cells[field.id];
      case "count": {
        if (hasProjectedValue) return record.cells[field.id];
        const linkFieldId = field.options.linkFieldId as string | undefined;
        const linked = linkFieldId ? record.cells[linkFieldId] : undefined;
        return Array.isArray(linked) ? linked.length : 0;
      }
      case "button":
        return field.options.label ?? "Open";
      default:
        return record.cells[field.id];
    }
  }

  toFormulaValue(field: FieldDTO, value: unknown): FormulaValue {
    if (isBlankValue(value)) return null;
    switch (field.type) {
      case "singleSelect":
        return choiceName(field, value);
      case "multiSelect":
        return asArray(value).map((id) => choiceName(field, id)).join(", ");
      case "link":
        return linkLabels(value).join(", ");
      case "lookup":
        return asArray(value).join(", ");
      case "user":
        return asArray(value).join(", ");
      case "checkbox":
        return Boolean(value);
      default:
        if (typeof value === "number" || typeof value === "boolean") return value;
        return String(value);
    }
  }

  toQueryValue(field: FieldDTO, value: unknown): unknown {
    if (isBlankValue(value)) return Array.isArray(value) ? [] : null;
    switch (field.type) {
      case "link":
        return linkLabels(value).join(", ");
      case "lookup":
        return Array.isArray(value) ? value.map(String).join(", ") : String(value);
      case "user":
        return asArray(value).join(", ");
      default:
        return value;
    }
  }

  toExportValue(field: FieldDTO, value: unknown): unknown {
    switch (field.type) {
      case "singleSelect":
        return isBlankValue(value) ? null : choiceName(field, value);
      case "multiSelect":
        return asArray(value).map((id) => choiceName(field, id));
      case "link":
        return linkLabels(value);
      case "user":
        return asArray(value);
      default:
        return value;
    }
  }

  toAutomationToken(field: FieldDTO, value: unknown): string {
    const exported = this.toExportValue(field, value);
    if (isBlankValue(exported)) return "";
    if (Array.isArray(exported)) return exported.map(String).filter(Boolean).join(", ");
    if (typeof exported === "object") return JSON.stringify(exported);
    return String(exported);
  }

  evaluateCondition(field: FieldDTO, cellOrRecord: unknown, op: FilterOp, target: unknown): boolean {
    const value = this.valueForCondition(field, cellOrRecord);
    return matchesOperator(value, op, target);
  }

  compareFieldValues(field: FieldDTO, a: unknown, b: unknown): number {
    const av = this.toQueryValue(field, a);
    const bv = this.toQueryValue(field, b);
    const ba = isBlankValue(av);
    const bb = isBlankValue(bv);
    if (ba && bb) return 0;
    if (ba) return 1;
    if (bb) return -1;

    if (field.type === "singleSelect") {
      const choices = choicesOf(field);
      const ia = choices.findIndex((choice) => choice.id === av);
      const ib = choices.findIndex((choice) => choice.id === bv);
      return ia - ib;
    }

    if (typeof av === "number" && typeof bv === "number") return av - bv;
    if (typeof av === "boolean" && typeof bv === "boolean") return Number(av) - Number(bv);
    if (this.isDateLike(field, av) && this.isDateLike(field, bv)) {
      return new Date(av as string).getTime() - new Date(bv as string).getTime();
    }
    return String(av).localeCompare(String(bv));
  }

  compareRecordsByField(field: FieldDTO, a: RecordDTO, b: RecordDTO): number {
    return this.compareFieldValues(
      field,
      this.computedValue(field, a),
      this.computedValue(field, b)
    );
  }

  dependencyGraph(): Map<string, Set<string>> {
    return new Map(this.fields.map((field) => [field.id, this.dependenciesFor(field)]));
  }

  dependenciesFor(field: FieldDTO): Set<string> {
    const deps = new Set<string>();
    if (field.type === "formula") {
      const expr = (field.options.expression as string) ?? "";
      for (const match of expr.matchAll(/\{([^}]+)\}/g)) {
        const ref = this.fieldsByName.get(match[1].trim().toLowerCase());
        if (ref) deps.add(ref.id);
      }
    }
    if (field.type === "lookup" || field.type === "rollup") {
      const linkFieldId = field.options.linkFieldId as string | undefined;
      const targetFieldId = field.options.targetFieldId as string | undefined;
      if (linkFieldId) deps.add(linkFieldId);
      if (targetFieldId) deps.add(targetFieldId);
    }
    if (field.type === "count") {
      const linkFieldId = field.options.linkFieldId as string | undefined;
      if (linkFieldId) deps.add(linkFieldId);
    }
    return deps;
  }

  detectCycles(): string[][] {
    const graph = this.dependencyGraph();
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const path: string[] = [];

    const visit = (fieldId: string) => {
      if (visiting.has(fieldId)) {
        const start = path.indexOf(fieldId);
        if (start >= 0) cycles.push([...path.slice(start), fieldId]);
        return;
      }
      if (visited.has(fieldId)) return;
      visiting.add(fieldId);
      path.push(fieldId);
      for (const dep of graph.get(fieldId) ?? []) {
        if (graph.has(dep)) visit(dep);
      }
      path.pop();
      visiting.delete(fieldId);
      visited.add(fieldId);
    };

    for (const field of this.fields) visit(field.id);
    return cycles;
  }

  private valueForCondition(field: FieldDTO, cellOrRecord: unknown): unknown {
    if (this.looksLikeRecord(cellOrRecord)) {
      return this.resolveField(field, cellOrRecord, "query");
    }
    return this.toQueryValue(field, cellOrRecord);
  }

  private isComputedField(field: FieldDTO): boolean {
    return (
      field.type === "formula" ||
      field.type === "lookup" ||
      field.type === "rollup" ||
      field.type === "count" ||
      field.type === "button" ||
      field.type === "autoNumber" ||
      field.type === "createdTime" ||
      field.type === "updatedTime" ||
      field.type === "createdBy" ||
      field.type === "updatedBy"
    );
  }

  private isDateLike(field: FieldDTO, value: unknown): boolean {
    return (
      field.type === "date" ||
      field.type === "dateTime" ||
      field.type === "createdTime" ||
      field.type === "updatedTime" ||
      looksLikeDate(value)
    );
  }

  private looksLikeRecord(value: unknown): value is RecordDTO {
    return !!value && typeof value === "object" && "cells" in value && "id" in value;
  }
}

export function normalizeFieldValue(
  type: FieldType,
  value: unknown,
  options: Record<string, unknown>
): unknown {
  if (value === null || value === undefined || value === "") return undefined;

  switch (type) {
    case "singleLineText":
    case "longText":
    case "url":
    case "email":
    case "phone":
      return String(value);

    case "number":
    case "currency":
    case "percent": {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[$€£¥,%\s]/g, ""));
      if (Number.isNaN(n)) throw new Error("Not a number");
      return n;
    }

    case "rating": {
      const max = (options.max as number) ?? 5;
      const n = Math.round(Number(value));
      if (Number.isNaN(n)) throw new Error("Not a number");
      return Math.max(0, Math.min(max, n));
    }

    case "checkbox":
      return parseBoolean(value);

    case "date": {
      const s = String(value);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    }
    case "dateTime": {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
      return d.toISOString();
    }

    case "singleSelect": {
      const choices = (options.choices as SelectChoice[]) ?? [];
      const idStr = String(value);
      if (!choices.some((choice) => choice.id === idStr)) throw new Error("Unknown choice");
      return idStr;
    }

    case "multiSelect": {
      const choices = (options.choices as SelectChoice[]) ?? [];
      const arr = Array.isArray(value) ? value : [value];
      const ids = arr.map(String);
      for (const choiceId of ids) {
        if (!choices.some((choice) => choice.id === choiceId)) throw new Error("Unknown choice");
      }
      return ids;
    }

    case "attachment":
      return normalizeAttachmentValue(value, options);

    case "user": {
      const allowMultiple = options.allowMultiple === true;
      const ids = (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
      if (!allowMultiple && ids.length > 1) throw new Error("Only one user is allowed");
      return allowMultiple ? ids : ids[0];
    }

    case "duration":
      return parseDurationSeconds(value);

    default:
      throw new Error(`Field type "${type}" is not directly editable`);
  }
}

export function makeRecordContext(
  fields: FieldDTO[],
  cells: Record<string, unknown>,
  record?: Partial<RecordDTO>
): RecordDTO {
  return {
    ...recordWithCells(cells),
    ...record,
    tableId: record?.tableId ?? fields[0]?.tableId ?? "tbl_context",
    cells,
  };
}

function matchesOperator(value: unknown, op: FilterOp, target: unknown): boolean {
  if (op === "isEmpty") return isBlankValue(value);
  if (op === "isNotEmpty") return !isBlankValue(value);
  if (isBlankValue(value)) return false;

  const vals = asArray(value);
  const targets = asArray(target);

  switch (op) {
    case "hasAnyOf":
      return targets.some((item) => vals.includes(item));
    case "hasAllOf":
      return targets.every((item) => vals.includes(item));
    case "hasNoneOf":
      return !targets.some((item) => vals.includes(item));
    case "isAnyOf":
      return targets.includes(String(value));
    case "isNoneOf":
      return !targets.includes(String(value));
    case "eq":
    case "neq":
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      const a = Number(value);
      const b = Number(target);
      if (Number.isNaN(a) || Number.isNaN(b)) return op === "neq";
      if (op === "eq") return a === b;
      if (op === "neq") return a !== b;
      if (op === "lt") return a < b;
      if (op === "lte") return a <= b;
      if (op === "gt") return a > b;
      return a >= b;
    }
    case "isBefore":
    case "isAfter":
    case "isOnOrBefore":
    case "isOnOrAfter": {
      const a = new Date(value as string).getTime();
      const b = target ? new Date(target as string).getTime() : NaN;
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      const sameDay = new Date(a).toDateString() === new Date(b).toDateString();
      if (op === "isBefore") return a < b && !sameDay;
      if (op === "isAfter") return a > b && !sameDay;
      if (op === "isOnOrBefore") return a <= b || sameDay;
      return a >= b || sameDay;
    }
    case "is": {
      if (typeof value === "boolean" || typeof target === "boolean") {
        return parseBoolean(value) === parseBoolean(target);
      }
      if (looksLikeDate(value) && looksLikeDate(target)) {
        return new Date(value as string).toDateString() === new Date(target as string).toDateString();
      }
      return String(value).toLowerCase() === String(target ?? "").toLowerCase();
    }
    case "isNot":
      return !matchesOperator(value, "is", target);
    case "contains":
      return String(value).toLowerCase().includes(String(target ?? "").toLowerCase());
    case "doesNotContain":
      return !String(value).toLowerCase().includes(String(target ?? "").toLowerCase());
    default:
      return true;
  }
}
