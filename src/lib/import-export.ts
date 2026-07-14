import { fieldCanStoreCellValue, fieldIsUnique, normalizeInitialCells, validateRequiredFields, valuesEqual } from "@/lib/field-behavior";
import type { ParsedCsv } from "@/lib/csv";
import type { FieldDTO, RecordDTO } from "@/lib/types";
import type { FieldType } from "@/server/db/schema";
import { SELECT_COLORS } from "@/lib/fields";

export type ImportMode = "strict" | "partial";
export type ImportTargetMode = "append" | "replace" | "create" | "merge";
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
  targetMode?: ImportTargetMode;
  mappings?: CsvImportMappingInput[];
  createMissingFields?: boolean;
  previewRowLimit?: number;
  mergeFieldId?: string;
  mergeHeader?: string;
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
  inference?: FieldTypeInference;
}

export interface FieldTypeInference {
  type: FieldType;
  confidence: number;
  reasons: string[];
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
  targetMode: ImportTargetMode;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  columns: CsvImportColumnPlan[];
  rows: CsvImportRowPlan[];
  previewRows: CsvImportRowPlan[];
  mergeCandidates: MergeCandidate[];
  selectedMerge?: MergeCandidate;
  relationshipSuggestions: RelationshipSuggestion[];
}

export interface MergeCandidate {
  header: string;
  fieldId?: string;
  fieldName?: string;
  uniqueSourceValues: number;
  blankRows: number;
  confidence: number;
  reason: string;
}

export interface RelationshipSuggestion {
  tableName: string;
  keyHeader: string;
  labelHeader?: string;
  uniqueEntities: number;
  sourceRows: number;
  confidence: number;
  fieldHeaders: string[];
  reason: string;
}

const WRITABLE_INFERRED_TYPES: FieldType[] = [
  "singleLineText",
  "longText",
  "number",
  "checkbox",
  "singleSelect",
  "multiSelect",
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

export function inferFieldType(values: string[], header = ""): FieldType {
  return inferFieldTypeProfile(header, values).type;
}

export function inferFieldTypeProfile(header: string, values: string[]): FieldTypeInference {
  const filled = values.map((value) => value.trim()).filter(Boolean);
  const lowerHeader = header.toLowerCase();
  if (filled.length === 0) return inference("singleLineText", 0.35, "column is empty");
  if (filled.every(isBooleanText)) return inference("checkbox", 0.95, "all populated values look boolean");
  if (filled.every(isEmailText)) return inference("email", 0.96, "all populated values look like email addresses");
  if (filled.every(isUrlText)) return inference("url", 0.96, "all populated values look like URLs");
  if (filled.every(isPhoneText)) return inference("phone", 0.88, "all populated values look like phone numbers");
  if (filled.every(isCurrencyText)) return inference("currency", 0.9, "all populated values look like currency");
  if (filled.every(isPercentText)) return inference("percent", 0.9, "all populated values look like percentages");
  if (filled.every(isNumberText)) return inferNumericType(lowerHeader, filled);
  if (filled.every(isDateTimeText)) return inference("dateTime", 0.9, "all populated values include date and time");
  if (filled.every(isDateText) || (looksDateHeader(lowerHeader) && mostly(filled, isDateText))) {
    return inference("date", looksDateHeader(lowerHeader) ? 0.86 : 0.82, "header/value profile looks like dates");
  }
  if (filled.some((value) => value.length > 140 || value.includes("\n"))) return inference("longText", 0.9, "values contain long text or line breaks");

  const unique = new Set(filled.map((value) => value.trim())).size;
  if (looksSelectHeader(lowerHeader) && unique <= Math.max(12, Math.ceil(filled.length * 0.35))) {
    return inference("singleSelect", 0.78, "header suggests a status/category and values have low cardinality");
  }
  if (filled.every((value) => value.includes(",") || value.includes(";")) && unique <= Math.max(20, Math.ceil(filled.length * 0.7))) {
    return inference("multiSelect", 0.62, "values look like delimited option lists");
  }
  if (looksIdHeader(lowerHeader)) return inference("singleLineText", 0.85, "header looks like an external identifier");
  return inference("singleLineText", 0.65, "text is the safest writable type");
}

function isBooleanText(value: string) {
  return /^(true|false|yes|no|on|off|1|0)$/i.test(value.trim());
}

function inference(type: FieldType, confidence: number, ...reasons: string[]): FieldTypeInference {
  return { type, confidence, reasons };
}

function inferNumericType(header: string, values: string[]): FieldTypeInference {
  if (header.includes("%") || /\b(percent|percentage|completion|utilization|pacing)\b/.test(header)) {
    return inference("percent", 0.82, "header suggests a percentage and values are numeric");
  }
  if (/\b(cost|price|amount|revenue|arr|mrr|currency|budget)\b/.test(header)) {
    return inference("currency", 0.78, "header suggests currency and values are numeric");
  }
  if (/\b(rating|score)\b/.test(header) && values.every((value) => Number(value) >= 0 && Number(value) <= 5)) {
    return inference("rating", 0.72, "header suggests rating/score and values fit a 0-5 range");
  }
  if (/\b(duration|elapsed|hours?|minutes?|seconds?|sla)\b/.test(header)) {
    return inference("duration", 0.68, "header suggests duration/SLA and values are numeric");
  }
  return inference("number", 0.9, "all populated values are numeric");
}

function isDateTimeText(value: string) {
  const trimmed = value.trim();
  return /[t ]\d{1,2}:\d{2}/i.test(trimmed) && !Number.isNaN(new Date(trimmed).getTime());
}

function isDateText(value: string) {
  const trimmed = value.trim();
  return (
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed) ||
    /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(trimmed) ||
    /^[a-z]{3,9}\s+\d{1,2},?\s+\d{4}$/i.test(trimmed)
  ) && !Number.isNaN(new Date(trimmed).getTime());
}

function isUrlText(value: string) {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function isEmailText(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isNumberText(value: string) {
  return !Number.isNaN(Number(value.trim().replace(/,/g, "")));
}

function isCurrencyText(value: string) {
  const trimmed = value.trim();
  return /^[$€£¥]\s*-?\d[\d,]*(\.\d+)?$/.test(trimmed) || /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed);
}

function isPercentText(value: string) {
  return /^-?\d[\d,]*(\.\d+)?%$/.test(value.trim());
}

function isPhoneText(value: string) {
  return /^\+?[\d\s().-]{7,}$/.test(value.trim()) && /\d{7,}/.test(value.replace(/\D/g, ""));
}

function mostly(values: string[], predicate: (value: string) => boolean) {
  return values.filter(predicate).length / Math.max(values.length, 1) >= 0.8;
}

function looksDateHeader(header: string) {
  return /\b(date|due|created|updated|returned|sent|received|start|end|timestamp|time)\b/.test(header);
}

function looksSelectHeader(header: string) {
  return /\b(status|phase|type|segment|priority|category|pod|team|owner|lead|request|support)\b/.test(header) || header.endsWith("?");
}

function looksIdHeader(header: string) {
  return /\b(id|airtable|salesforce|sf|customer id|external)\b/.test(header);
}

export function buildCsvImportPlan(
  parsed: ParsedCsv,
  existingFields: FieldDTO[],
  existingRecords: RecordDTO[],
  options: CsvImportOptions = {}
): CsvImportPlan {
  const targetMode = options.targetMode ?? "append";
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
    const inference = inferFieldTypeProfile(header, parsed.rows.map((row) => row[header] ?? ""));
    const type = safeWritableType(explicit?.type ?? inference.type);
    return {
      header,
      action: "create",
      tempFieldId: `__new_${header}`,
      fieldName: explicit?.name?.trim() || header,
      type,
      options: explicit?.options ?? optionsForInferredType(type, parsed.rows.map((row) => row[header] ?? "")),
      inference: explicit?.type ? { type, confidence: 1, reasons: ["chosen by mapping"] } : inference,
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
    targetMode,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    columns,
    rows,
    previewRows: rows.slice(0, options.previewRowLimit ?? 10),
    mergeCandidates: findMergeCandidates(parsed, existingFields),
    selectedMerge: selectedMergeCandidate(parsed, existingFields, options),
    relationshipSuggestions: inferRelationshipSuggestions(parsed),
  };
}

function optionsForInferredType(type: FieldType, values: string[]): Record<string, unknown> {
  if (type !== "singleSelect" && type !== "multiSelect") return {};
  const choices = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .slice(0, 100)
    .map((value, index) => ({ id: value, name: value, color: SELECT_COLORS[index % SELECT_COLORS.length] }));
  return { choices };
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

function findMergeCandidates(parsed: ParsedCsv, existingFields: FieldDTO[]): MergeCandidate[] {
  const fieldsByName = new Map(existingFields.map((field) => [field.name.trim().toLowerCase(), field]));
  return parsed.headers
    .map((header): MergeCandidate => {
      const values = parsed.rows.map((row) => row[header]?.trim() ?? "");
      const filled = values.filter(Boolean);
      const uniqueSourceValues = new Set(filled).size;
      const field = fieldsByName.get(header.trim().toLowerCase());
      const blankRows = values.length - filled.length;
      const uniqueRatio = filled.length ? uniqueSourceValues / filled.length : 0;
      const idBoost = looksIdHeader(header.toLowerCase()) || (field ? fieldIsUnique(field) : false) ? 0.25 : 0;
      const confidence = Math.min(0.98, Math.round((uniqueRatio * 0.7 + (field ? 0.18 : 0) + idBoost) * 100) / 100);
      return {
        header,
        fieldId: field?.id,
        fieldName: field?.name,
        uniqueSourceValues,
        blankRows,
        confidence,
        reason: field
          ? `Matches existing field "${field.name}" with ${uniqueSourceValues} unique source values`
          : `${uniqueSourceValues} unique source values; no existing same-name field`,
      };
    })
    .filter((candidate) => candidate.confidence >= 0.55)
    .sort((a, b) => b.confidence - a.confidence);
}

function selectedMergeCandidate(parsed: ParsedCsv, existingFields: FieldDTO[], options: CsvImportOptions) {
  if (!options.mergeFieldId && !options.mergeHeader) return undefined;
  return findMergeCandidates(parsed, existingFields).find((candidate) =>
    (options.mergeFieldId && candidate.fieldId === options.mergeFieldId) ||
    (options.mergeHeader && candidate.header === options.mergeHeader)
  );
}

function inferRelationshipSuggestions(parsed: ParsedCsv): RelationshipSuggestion[] {
  const customerKey = findHeader(parsed.headers, ["securitypal customer id", "customer id", "sf id", "salesforce"]);
  const customerName = findHeader(parsed.headers, ["client name", "client", "customer"]);
  if (!customerKey && !customerName) return [];

  const keyHeader = customerKey ?? customerName!;
  const values = parsed.rows.map((row) => row[keyHeader]?.trim() ?? "").filter(Boolean);
  const uniqueEntities = new Set(values).size;
  const customerHeaders = parsed.headers.filter((header) =>
    /\b(client|customer|salesforce|sf|service start|service end|utilization|token)\b/i.test(header)
  );
  if (uniqueEntities === 0 || uniqueEntities >= parsed.rows.length) return [];

  return [{
    tableName: "Customers",
    keyHeader,
    labelHeader: customerName,
    uniqueEntities,
    sourceRows: parsed.rows.length,
    confidence: customerKey ? 0.86 : 0.7,
    fieldHeaders: customerHeaders,
    reason: `${uniqueEntities} unique customer values repeat across ${parsed.rows.length} source rows`,
  }];
}

function findHeader(headers: string[], needles: string[]) {
  return headers.find((header) => needles.some((needle) => header.toLowerCase().includes(needle)));
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
