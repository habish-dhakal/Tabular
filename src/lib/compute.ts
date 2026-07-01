import type { FieldDTO, RecordDTO } from "@/lib/types";
import type { SelectChoice } from "@/lib/fields";
import { evaluateFormula, type FormulaValue } from "@/lib/formula";

/** Human-facing value of a raw stored cell, used when a formula references it. */
function resolvedStoredValue(field: FieldDTO, raw: unknown): FormulaValue {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "singleSelect") {
    const c = (field.options.choices as SelectChoice[])?.find((x) => x.id === raw);
    return c ? c.name : String(raw);
  }
  if (field.type === "multiSelect") {
    const cs = (field.options.choices as SelectChoice[]) ?? [];
    return (raw as string[]).map((id) => cs.find((c) => c.id === id)?.name ?? id).join(", ");
  }
  if (field.type === "checkbox") return Boolean(raw);
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  return String(raw);
}

/**
 * Value to DISPLAY for a field on a record. For plain fields this is just the
 * stored cell; for computed fields (formula, created/updated time/by) it is
 * derived. `computeCellValue` is what every view should render, not raw cells.
 */
export function computeCellValue(
  field: FieldDTO,
  record: RecordDTO,
  fields: FieldDTO[],
  _seen: Set<string> = new Set()
): unknown {
  switch (field.type) {
    case "formula": {
      const expr = (field.options.expression as string) ?? "";
      if (!expr.trim()) return null;
      if (_seen.has(field.id)) return "#CYCLE";
      _seen.add(field.id);
      const byName = new Map(fields.map((f) => [f.name.toLowerCase(), f]));
      return evaluateFormula(expr, (name) => {
        const ref = byName.get(name.toLowerCase());
        if (!ref) return null;
        if (ref.type === "formula" || ref.type === "createdTime" || ref.type === "updatedTime") {
          const v = computeCellValue(ref, record, fields, _seen);
          return (v ?? null) as FormulaValue;
        }
        return resolvedStoredValue(ref, record.cells[ref.id]) as FormulaValue;
      });
    }
    case "createdTime":
      return record.createdAt ?? null;
    case "updatedTime":
      return record.updatedAt ?? null;
    case "createdBy":
      return record.createdBy ?? null;
    case "updatedBy":
      return record.updatedBy ?? null;
    // lookup / rollup / autoNumber: resolved in a later phase
    case "lookup":
    case "rollup":
    case "autoNumber":
      return null;
    default:
      return record.cells[field.id];
  }
}
