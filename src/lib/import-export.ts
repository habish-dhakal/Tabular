import { fieldCanStoreCellValue, fieldIsUnique, normalizeInitialCells, validateRequiredFields, valuesEqual } from "@/lib/field-behavior";
import type { ParsedCsv } from "@/lib/csv";
import type { FieldDTO, RecordDTO } from "@/lib/types";
import type { FieldType } from "@/server/db/schema";

export type ImportMode = "strict" | "partial";
export type ImportColumnAction = "map" | "create" | "skip";

export interface CsvImportMappingInput {
  header: string;
  action?: ImportColumnAction;
  fieldId?: string;
  name?: string;
  type?: FieldType;
  options?: Record<string, unknown>;
}

export interface CsvImportOptions {
  mappings?: CsvImportMappingInput[];
  createMissingFields?: boolean;
  previewRowLimit?: number;
}

export interface CsvImportColumnPlan {
  header: string;
  action: ImportColumnAction;
  fieldId?: string;
  tempFieldId?: string;
  fieldName?: string;
  type?: FieldType;
  options?: Record<string, unknown>;
  reason?: string;
}

export interface CsvImportRowIssue {
  header?: string;
  fieldId?: string;
  message: string;
}

export interface CsvImportRowPlan {
  index: number;
  source: Record<string, string>;
  cells: Record<string, unknown>;
  valid: boolean;
  issues: CsvImportRowIssue[];
}

export interface CsvImportPlan {
  headers: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  columns: CsvImportColumnPlan[];
  rows: CsvImportRowPlan[];
  previewRows: CsvImportRowPlan[];
}

const WRITABLE_INFERRED_TYPES: FieldType[] = [
  "singleLineText",
  "longText",
  "number",
  "checkbox",
  "date",
  "dateTime",
  "url",
  "email",
];
const CSV_CREATABLE_TYPES: FieldType[] = [
  ...WRITABLE_INFERRED_TYPES,
  "currency",
  "percent",
  "phone",
  "rating",
  "duration",
];

export function inferFieldType(values: string[]): FieldType {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  if (filled.length === 0) return "singleLineText";
  if (filled.every(isBooleanText)) return "checkbox";
  if (filled.every((value) => !Number.isNaN(Number(value)))) return "number";
  if (filled.every(isIsoDateTime)) return "dateTime";
  if (filled.every(isDateText)) return "date";
  if (filled.every(isUrlText)) return "url";
  if (filled.every(isEmailText)) return "email";
  if (filled.some((value) => value.length > 140 || value.includes("\n"))) return "longText";
  return "singleLineText";
}

function isBooleanText(value: string) {
  return /^(true|false|yes|no|on|off|1|0)$/i.test(value.trim());
}

function isIsoDateTime(value: string) {
  return /^\d{4}-\d{2}-\d{2}t\d{2}:/i.test(value.trim()) && !Number.isNaN(new Date(value).getTime());
}

function isDateText(value: string) {
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(value.trim()) && !Number.isNaN(new Date(value).getTime());
}

function isUrlText(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function isEmailText(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function buildCsvImportPlan(
  parsed: ParsedCsv,
  existingFields: FieldDTO[],
  existingRecords: RecordDTO[],
  options: CsvImportOptions = {}
): CsvImportPlan {
  const mappings = new Map((options.mappings ?? []).map((mapping) => [mapping.header, mapping]));
  const fieldsById = new Map(existingFields.map((field) => [field.id, field]));
  const fieldsByName = new Map(existingFields.map((field) => [field.name.trim().toLowerCase(), field]));
  const createMissingFields = options.createMissingFields !== false;

  const columns = parsed.headers.map((header): CsvImportColumnPlan => {
    const explicit = mappings.get(header);
    if (explicit?.action === "skip") return { header, action: "skip", reason: "Skipped by mapping" };

    if (explicit?.fieldId) {
      const field = fieldsById.get(explicit.fieldId);
      if (!field) return { header, action: "skip", fieldId: explicit.fieldId, reason: "Mapped field was not found" };
      return { header, action: "map", fieldId: field.id, fieldName: field.name, type: field.type, options: field.options };
    }

    const matched = fieldsByName.get((explicit?.name ?? header).trim().toLowerCase());
    if (matched) return { header, action: "map", fieldId: matched.id, fieldName: matched.name, type: matched.type, options: matched.options };

    if (!createMissingFields) return { header, action: "skip", reason: "No matching field" };
    const type = safeWritableType(explicit?.type ?? inferFieldType(parsed.rows.map((row) => row[header] ?? "")));
    return {
      header,
      action: "create",
      tempFieldId: `__new_${header}`,
      fieldName: explicit?.name?.trim() || header,
      type,
      options: explicit?.options ?? {},
    };
  });

  const plannedFields = columns
    .filter((column) => column.action === "create" && column.tempFieldId && column.type)
    .map((column, position): FieldDTO => ({
      id: column.tempFieldId!,
      tableId: existingFields[0]?.tableId ?? "tbl_import",
      name: column.fieldName ?? column.header,
      type: column.type!,
      options: column.options ?? {},
      position: existingFields.length + position,
      isPrimary: false,
    }));
  const plannedFieldByTempId = new Map(plannedFields.map((field) => [field.id, field]));
  const allFields = [...existingFields, ...plannedFields];
  const seenUnique = new Map<string, unknown[]>();

  const rows = parsed.rows.map((source, index): CsvImportRowPlan => {
    const rawCells: Record<string, unknown> = {};
    const issues: CsvImportRowIssue[] = [];

    for (const column of columns) {
      if (column.action === "skip") continue;
      const field = column.fieldId ? fieldsById.get(column.fieldId) : plannedFieldByTempId.get(column.tempFieldId ?? "");
      if (!field) {
        issues.push({ header: column.header, fieldId: column.fieldId, message: column.reason ?? "No target field" });
        continue;
      }
      if (!fieldCanStoreCellValue(field)) {
        issues.push({ header: column.header, fieldId: field.id, message: `"${field.name}" is not directly writable` });
        continue;
      }
      const value = source[column.header];
      if (value === undefined || value.trim() === "") continue;
      rawCells[field.id] = value;
    }

    let cells: Record<string, unknown> = {};
    try {
      cells = normalizeInitialCells(allFields, rawCells);
      validateRequiredFields(allFields, cells);
      validateUniqueImportCells(existingRecords, allFields, cells, seenUnique);
    } catch (err) {
      issues.push({ message: err instanceof Error ? err.message : "Row is invalid" });
    }

    if (issues.length === 0) {
      for (const field of allFields.filter(fieldIsUnique)) {
        if (cells[field.id] === undefined || cells[field.id] === null || cells[field.id] === "") continue;
        seenUnique.set(field.id, [...(seenUnique.get(field.id) ?? []), cells[field.id]]);
      }
    }

    return { index: index + 1, source, cells, valid: issues.length === 0, issues };
  });

  const validRows = rows.filter((row) => row.valid).length;
  return {
    headers: parsed.headers,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    columns,
    rows,
    previewRows: rows.slice(0, options.previewRowLimit ?? 10),
  };
}

function safeWritableType(type: FieldType): FieldType {
  return CSV_CREATABLE_TYPES.includes(type) ? type : "singleLineText";
}

function validateUniqueImportCells(
  existingRecords: RecordDTO[],
  fields: FieldDTO[],
  cells: Record<string, unknown>,
  seenUnique: Map<string, unknown[]>
) {
  for (const field of fields.filter(fieldIsUnique)) {
    const value = cells[field.id];
    if (value === undefined || value === null || value === "") continue;
    if (existingRecords.some((record) => valuesEqual(record.cells[field.id], value))) {
      throw new Error(`Field "${field.name}" must be unique`);
    }
    if ((seenUnique.get(field.id) ?? []).some((item) => valuesEqual(item, value))) {
      throw new Error(`Field "${field.name}" has duplicate values in the import`);
    }
  }
}

export interface AirtableFieldSource {
  id: string;
  name: string;
  type: string;
  options?: Record<string, unknown>;
}

export interface AirtableRecordSource {
  id: string;
  fields: Record<string, unknown>;
}

export interface AirtableTableSource {
  id: string;
  name: string;
  fields: AirtableFieldSource[];
  records: AirtableRecordSource[];
}

export interface AirtableBaseSource {
  id?: string;
  name: string;
  tables: AirtableTableSource[];
}

export function planAirtableImport(source: AirtableBaseSource) {
  const linkFields = source.tables.flatMap((table) =>
    table.fields
      .filter((field) => field.type === "multipleRecordLinks")
      .map((field) => ({ tableId: table.id, tableName: table.name, fieldId: field.id, fieldName: field.name }))
  );
  const computedFields = source.tables.flatMap((table) =>
    table.fields
      .filter((field) => ["formula", "lookup", "rollup", "count"].includes(field.type))
      .map((field) => ({ tableId: table.id, tableName: table.name, fieldId: field.id, fieldName: field.name, type: field.type }))
  );

  return {
    sourceBaseId: source.id ?? null,
    sourceBaseName: source.name,
    recordIdStrategy: "Preserve Airtable record ids in an __airtableRecordId field and use them as the link reconstruction map.",
    stages: [
      { name: "create_tables", order: 1, items: source.tables.length },
      { name: "create_fields", order: 2, items: source.tables.reduce((sum, table) => sum + table.fields.length, 0) },
      { name: "import_records", order: 3, items: source.tables.reduce((sum, table) => sum + table.records.length, 0) },
      { name: "recreate_links", order: 4, items: linkFields.length },
      { name: "computed_parity_report", order: 5, items: computedFields.length },
    ],
    tables: source.tables.map((table) => ({
      sourceId: table.id,
      name: table.name,
      fieldCount: table.fields.length,
      recordCount: table.records.length,
    })),
    linkFields,
    computedFields,
    warnings: [
      ...computedFields.map((field) => `${field.tableName}.${field.fieldName} (${field.type}) needs parity verification after records import.`),
      ...linkFields.map((field) => `${field.tableName}.${field.fieldName} links must be recreated after all records exist.`),
    ],
  };
}
