import type { FieldDTO, RecordDTO } from "@/lib/types";
import type { FieldType } from "@/server/db/schema";
import { coerceCellValue, isComputed } from "@/lib/fields";
import { isBlankValue } from "@/lib/value-resolver";

export interface ConversionPreview {
  total: number;
  convertible: number;
  cleared: number;
  samples: { recordId: string; before: unknown; reason: string }[];
}

export function fieldDescription(field: FieldDTO): string {
  return String(field.options.description ?? "").trim();
}

export function fieldIsRequired(field: FieldDTO): boolean {
  return fieldCanStoreCellValue(field) && field.options.required === true;
}

export function fieldIsUnique(field: FieldDTO): boolean {
  return fieldCanStoreCellValue(field) && field.options.unique === true;
}

export function fieldCanStoreCellValue(field: FieldDTO): boolean {
  return !isComputed(field.type) && field.type !== "link" && field.type !== "button";
}

export function fieldIsFormEligible(field: FieldDTO): boolean {
  return fieldCanStoreCellValue(field) && field.type !== "attachment" && field.type !== "user";
}

export function normalizeWritableFieldValue(field: FieldDTO, value: unknown): unknown {
  if (!fieldCanStoreCellValue(field)) throw new Error(`Field "${field.name}" is not directly editable`);
  return coerceCellValue(field.type, value, field.options);
}

export function defaultValueForField(field: FieldDTO): unknown {
  if (!fieldCanStoreCellValue(field) || !("defaultValue" in field.options)) return undefined;
  return normalizeWritableFieldValue(field, field.options.defaultValue);
}

export function normalizeInitialCells(fields: FieldDTO[], input: Record<string, unknown>): Record<string, unknown> {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const cells: Record<string, unknown> = {};

  for (const [fieldId, raw] of Object.entries(input)) {
    const field = byId.get(fieldId);
    if (!field) throw new Error(`Unknown field ${fieldId}`);
    const value = normalizeWritableFieldValue(field, raw);
    if (value !== undefined) cells[fieldId] = value;
  }

  for (const field of fields) {
    if (field.id in cells) continue;
    const value = defaultValueForField(field);
    if (value !== undefined) cells[field.id] = value;
  }

  return cells;
}

export function normalizePatchedCells(
  fields: FieldDTO[],
  before: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const byId = new Map(fields.map((field) => [field.id, field]));
  const cells = { ...before };

  for (const [fieldId, raw] of Object.entries(patch)) {
    const field = byId.get(fieldId);
    if (!field) throw new Error(`Unknown field ${fieldId}`);
    const value = normalizeWritableFieldValue(field, raw);
    if (value === undefined) delete cells[fieldId];
    else cells[fieldId] = value;
  }

  return cells;
}

export function validateRequiredFields(fields: FieldDTO[], cells: Record<string, unknown>) {
  for (const field of fields) {
    if (fieldIsRequired(field) && isBlankValue(cells[field.id])) {
      throw new Error(`Field "${field.name}" is required`);
    }
  }
}

export function userIdsForFieldValue(field: FieldDTO, value: unknown): string[] {
  if (field.type !== "user" || isBlankValue(value)) return [];
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function duplicateUniqueValue(
  records: RecordDTO[],
  field: FieldDTO,
  value: unknown,
  excludeRecordId?: string
): RecordDTO | null {
  if (!fieldIsUnique(field) || isBlankValue(value)) return null;
  return records.find((record) => record.id !== excludeRecordId && valuesEqual(record.cells[field.id], value)) ?? null;
}

export function previewFieldConversion(
  field: FieldDTO,
  records: RecordDTO[],
  nextType: FieldType,
  nextOptions: Record<string, unknown> = {}
): ConversionPreview {
  const samples: ConversionPreview["samples"] = [];
  let total = 0;
  let convertible = 0;
  let cleared = 0;
  const nextField: FieldDTO = { ...field, type: nextType, options: nextOptions };

  for (const record of records) {
    if (!(field.id in record.cells)) continue;
    total++;
    try {
      if (!fieldCanStoreCellValue(nextField)) throw new Error("target type is computed or action-only");
      const converted = normalizeWritableFieldValue(nextField, record.cells[field.id]);
      if (converted === undefined) cleared++;
      else convertible++;
    } catch (err) {
      cleared++;
      if (samples.length < 5) {
        samples.push({
          recordId: record.id,
          before: record.cells[field.id],
          reason: err instanceof Error ? err.message : "Cannot convert value",
        });
      }
    }
  }

  return { total, convertible, cleared, samples };
}
