import { asc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { parseCsv, stringifyCsvMatrix } from "@/lib/csv";
import {
  buildCsvImportPlan,
  planAirtableImport,
  type AirtableBaseSource,
  type CsvImportMappingInput,
  type CsvImportPlan,
  type ImportMode,
  type ImportTargetMode,
} from "@/lib/import-export";
import { normalizeInitialCells, validateRequiredFields, valuesEqual } from "@/lib/field-behavior";
import { FIELD_TYPE_META } from "@/lib/fields";
import { applyFilterSort } from "@/lib/query";
import type { FieldDTO, RecordDTO, ViewDTO } from "@/lib/types";
import { ValueResolver } from "@/lib/value-resolver";
import { db } from "@/server/db";
import { bases, fields, recordLinks, records, tables, views, type FieldType } from "@/server/db/schema";
import { createField, deleteField } from "@/server/services/fields";
import { createRecord, listRecords, updateRecordCells } from "@/server/services/records";
import { enrichRecords } from "@/server/services/links";
import { toRecordDTO } from "@/server/services/record-dto";

export interface CsvImportRequest {
  csv: string;
  mode?: ImportMode;
  targetMode?: ImportTargetMode;
  tableId?: string;
  tableName?: string;
  mergeFieldId?: string;
  mergeHeader?: string;
  confirmReplace?: boolean;
  mappings?: CsvImportMappingInput[];
  createMissingFields?: boolean;
}

export interface CsvImportCommitReport {
  jobId: string;
  status: "completed" | "completed_with_errors";
  mode: ImportMode;
  targetMode: ImportTargetMode;
  tableId: string;
  tableName: string;
  viewId?: string;
  totalRows: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  invalidRows: number;
  createdFields: FieldDTO[];
  rowErrors: { row: number; errors: string[] }[];
}

const IMPORT_BATCH_SIZE = 500;
type ImportTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function previewCsvImport(tableId: string, request: CsvImportRequest): Promise<CsvImportPlan> {
  const parsed = parseCsv(request.csv);
  const targetMode = request.targetMode ?? "append";
  const [tableFields, tableRecordRows] = await Promise.all([
    db.query.fields.findMany({ where: eq(fields.tableId, tableId), orderBy: asc(fields.position) }) as Promise<FieldDTO[]>,
    db.query.records.findMany({ where: eq(records.tableId, tableId) }),
  ]);
  return buildCsvImportPlan(parsed, targetMode === "replace" ? [] : tableFields, targetMode === "replace" ? [] : tableRecordRows.map(toRecordDTO), {
    targetMode,
    mappings: request.mappings,
    createMissingFields: request.createMissingFields,
    mergeFieldId: request.mergeFieldId,
    mergeHeader: request.mergeHeader,
  });
}

export async function previewBaseCsvImport(baseId: string, request: CsvImportRequest): Promise<CsvImportPlan> {
  if (request.targetMode === "create") {
    return buildCsvImportPlan(parseCsv(request.csv), [], [], { targetMode: "create", mappings: request.mappings });
  }
  if (!request.tableId) throw new Error("A target table is required");
  await assertTableBelongsToBase(request.tableId, baseId);
  return previewCsvImport(request.tableId, request);
}

export async function commitBaseCsvImport(
  baseId: string,
  userId: string,
  request: CsvImportRequest
): Promise<CsvImportCommitReport> {
  if ((request.targetMode ?? "append") === "create") return commitCreateTableCsvImport(baseId, userId, request);
  if (!request.tableId) throw new Error("A target table is required");
  await assertTableBelongsToBase(request.tableId, baseId);
  return commitCsvImport(request.tableId, userId, request);
}

export async function commitCsvImport(
  tableId: string,
  userId: string,
  request: CsvImportRequest
): Promise<CsvImportCommitReport> {
  const mode = request.mode ?? "strict";
  const targetMode = request.targetMode ?? "append";
  if (targetMode === "create") {
    const table = await db.query.tables.findFirst({ where: eq(tables.id, tableId) });
    if (!table) throw new Error("Table not found");
    return commitCreateTableCsvImport(table.baseId, userId, request);
  }
  if (targetMode === "replace") return commitReplaceCsvImport(tableId, userId, request);
  if (targetMode === "merge") return commitMergeCsvImport(tableId, userId, request);

  const plan = await previewCsvImport(tableId, request);
  const rowErrors = plan.rows
    .filter((row) => !row.valid)
    .map((row) => ({ row: row.index, errors: row.issues.map((issue) => issue.message) }));

  if (mode === "strict" && plan.invalidRows > 0) {
    return {
      jobId: importJobId(),
      status: "completed_with_errors",
      mode,
      targetMode,
      tableId,
      tableName: await tableName(tableId),
      totalRows: plan.totalRows,
      insertedRows: 0,
      updatedRows: 0,
      skippedRows: plan.invalidRows,
      invalidRows: plan.invalidRows,
      createdFields: [],
      rowErrors,
    };
  }

  const createdFields: FieldDTO[] = [];
  const insertedRecordIds: string[] = [];
  const tempToFieldId = new Map<string, string>();

  try {
    for (const column of plan.columns) {
      if (column.action !== "create" || !column.tempFieldId || !column.fieldName || !column.type) continue;
      const created = await createField(tableId, column.fieldName, column.type as FieldType, column.options);
      createdFields.push(created as FieldDTO);
      tempToFieldId.set(column.tempFieldId, created.id);
    }

    for (const batch of chunk(plan.rows.filter((row) => row.valid), IMPORT_BATCH_SIZE)) {
      for (const row of batch) {
        const cells = translateTempFieldIds(row.cells, tempToFieldId);
        try {
          const inserted = await createRecord(tableId, userId, cells);
          insertedRecordIds.push(inserted.id);
        } catch (err) {
          rowErrors.push({ row: row.index, errors: [err instanceof Error ? err.message : "Row write failed"] });
          if (mode === "strict") throw err;
        }
      }
    }

    const insertedRows = insertedRecordIds.length;
    const skippedRows = plan.totalRows - insertedRows;
    return {
      jobId: importJobId(),
      status: rowErrors.length ? "completed_with_errors" : "completed",
      mode,
      targetMode,
      tableId,
      tableName: await tableName(tableId),
      viewId: await firstGridViewId(tableId),
      totalRows: plan.totalRows,
      insertedRows,
      updatedRows: 0,
      skippedRows,
      invalidRows: rowErrors.length,
      createdFields,
      rowErrors,
    };
  } catch (err) {
    await rollbackImport(createdFields, insertedRecordIds);
    throw new Error(`Strict import rolled back: ${err instanceof Error ? err.message : "import failed"}`);
  }
}

async function commitCreateTableCsvImport(
  baseId: string,
  userId: string,
  request: CsvImportRequest
): Promise<CsvImportCommitReport> {
  const mode = request.mode ?? "strict";
  const plan = buildCsvImportPlan(parseCsv(request.csv), [], [], {
    targetMode: "create",
    mappings: request.mappings,
    previewRowLimit: 10,
  });
  const rowErrors = importRowErrors(plan);
  if (mode === "strict" && plan.invalidRows > 0) return blockedReport(plan, mode, "create", "", request.tableName ?? suggestedTableName(request.csv), rowErrors);
  return db.transaction(async (tx) => {
    const posRow = await tx.select({ max: sql<number>`coalesce(max(${tables.position}), 0)` }).from(tables).where(eq(tables.baseId, baseId));
    const [table] = await tx.insert(tables).values({
      baseId,
      name: cleanTableName(request.tableName) ?? suggestedTableName(request.csv),
      position: (posRow[0]?.max ?? 0) + 1,
    }).returning();
    const { createdFields, tempToFieldId, persistedFields } = await insertPlannedFields(tx, table.id, plan);
    const [view] = await tx.insert(views).values({
      tableId: table.id,
      name: "Grid view",
      type: "grid",
      position: 0,
      config: { fieldOrder: createdFields.map((field) => field.id) },
    }).returning();
    const insertedRows = await insertPlannedRows(tx, table.id, userId, persistedFields, plan, tempToFieldId, mode, rowErrors);
    return {
      jobId: importJobId(),
      status: rowErrors.length ? "completed_with_errors" : "completed",
      mode,
      targetMode: "create",
      tableId: table.id,
      tableName: table.name,
      viewId: view.id,
      totalRows: plan.totalRows,
      insertedRows,
      updatedRows: 0,
      skippedRows: plan.totalRows - insertedRows,
      invalidRows: rowErrors.length,
      createdFields,
      rowErrors,
    };
  });
}

async function commitReplaceCsvImport(
  tableId: string,
  userId: string,
  request: CsvImportRequest
): Promise<CsvImportCommitReport> {
  if (!request.confirmReplace) throw new Error("Replace import requires confirmation");
  const mode = request.mode ?? "strict";
  const plan = await previewCsvImport(tableId, { ...request, targetMode: "replace" });
  const rowErrors = importRowErrors(plan);
  if (mode === "strict" && plan.invalidRows > 0) return blockedReport(plan, mode, "replace", tableId, await tableName(tableId), rowErrors);

  const { cascadeDeleteFields, externalLinkFieldsInto } = await import("@/server/services/cleanup");
  return db.transaction(async (tx) => {
    const current = await tx.query.tables.findFirst({ where: eq(tables.id, tableId) });
    if (!current) throw new Error("Table not found");
    // Replace recreates this table's fields with new ids, so link fields in
    // *other* tables pointing here (and their dependent lookups/rollups) would
    // dangle. Clean them up first — same closure deleteTable relies on — then
    // wipe this table's own fields/records/views (own link edges cascade via FK).
    const external = await externalLinkFieldsInto(tx, tableId);
    if (external.length) await cascadeDeleteFields(tx, external);
    await tx.delete(records).where(eq(records.tableId, tableId));
    await tx.delete(fields).where(eq(fields.tableId, tableId));
    await tx.delete(views).where(eq(views.tableId, tableId));
    if (request.tableName?.trim()) await tx.update(tables).set({ name: request.tableName.trim() }).where(eq(tables.id, tableId));
    const { createdFields, tempToFieldId, persistedFields } = await insertPlannedFields(tx, tableId, plan);
    const [view] = await tx.insert(views).values({
      tableId,
      name: "Grid view",
      type: "grid",
      position: 0,
      config: { fieldOrder: createdFields.map((field) => field.id) },
    }).returning();
    const insertedRows = await insertPlannedRows(tx, tableId, userId, persistedFields, plan, tempToFieldId, mode, rowErrors);
    return {
      jobId: importJobId(),
      status: rowErrors.length ? "completed_with_errors" : "completed",
      mode,
      targetMode: "replace",
      tableId,
      tableName: request.tableName?.trim() || current.name,
      viewId: view.id,
      totalRows: plan.totalRows,
      insertedRows,
      updatedRows: 0,
      skippedRows: plan.totalRows - insertedRows,
      invalidRows: rowErrors.length,
      createdFields,
      rowErrors,
    };
  });
}

async function commitMergeCsvImport(
  tableId: string,
  userId: string,
  request: CsvImportRequest
): Promise<CsvImportCommitReport> {
  if (!request.mergeFieldId) throw new Error("Merge import requires a matching field");
  const mode = request.mode ?? "strict";
  const plan = await previewCsvImport(tableId, { ...request, targetMode: "merge" });
  const rowErrors = importRowErrors(plan);
  if (mode === "strict" && plan.invalidRows > 0) return blockedReport(plan, mode, "merge", tableId, await tableName(tableId), rowErrors);

  // The merge key is an existing field, so resolve it and validate every row's
  // key BEFORE any write. Otherwise a blank key on (say) row 300 throws
  // mid-loop in strict mode, leaving rows 1-299 and the new fields persisted —
  // a half-applied "strict" import. Services here aren't transaction-aware, so
  // this pre-flight is how we keep strict mode all-or-nothing.
  const existingFields = await db.query.fields.findMany({ where: eq(fields.tableId, tableId), orderBy: asc(fields.position) }) as FieldDTO[];
  const keyField = existingFields.find((field) => field.id === request.mergeFieldId);
  if (!keyField) throw new Error("Merge field not found");

  const validRows = plan.rows.filter((item) => item.valid);
  const isBlankKey = (row: (typeof validRows)[number]) => {
    const keyValue = row.cells[keyField.id];
    return keyValue === undefined || keyValue === null || keyValue === "";
  };
  if (mode === "strict") {
    const blankKeyRows = validRows.filter(isBlankKey);
    if (blankKeyRows.length) {
      for (const row of blankKeyRows) rowErrors.push({ row: row.index, errors: [`Merge field "${keyField.name}" is blank`] });
      return blockedReport(plan, mode, "merge", tableId, await tableName(tableId), rowErrors);
    }
  }

  const createdFields: FieldDTO[] = [];
  const tempToFieldId = new Map<string, string>();
  for (const column of plan.columns) {
    if (column.action !== "create" || !column.tempFieldId || !column.fieldName || !column.type) continue;
    const created = await createField(tableId, column.fieldName, column.type as FieldType, column.options);
    createdFields.push(created as FieldDTO);
    tempToFieldId.set(column.tempFieldId, created.id);
  }

  const existing = (await listRecords(tableId, 100_000, 0)).map(toRecordDTO);
  let insertedRows = 0;
  let updatedRows = 0;
  for (const row of validRows) {
    const cells = translateTempFieldIds(row.cells, tempToFieldId);
    const keyValue = cells[keyField.id];
    if (keyValue === undefined || keyValue === null || keyValue === "") {
      // Only reachable in partial mode now — strict blocked above with no writes.
      rowErrors.push({ row: row.index, errors: [`Merge field "${keyField.name}" is blank`] });
      continue;
    }
    const match = existing.find((record) => valuesEqual(record.cells[keyField.id], keyValue));
    if (match) {
      await updateRecordCells(match.id, userId, cells);
      updatedRows++;
    } else {
      const inserted = await createRecord(tableId, userId, cells);
      existing.push(toRecordDTO(inserted));
      insertedRows++;
    }
  }
  return {
    jobId: importJobId(),
    status: rowErrors.length ? "completed_with_errors" : "completed",
    mode,
    targetMode: "merge",
    tableId,
    tableName: await tableName(tableId),
    viewId: await firstGridViewId(tableId),
    totalRows: plan.totalRows,
    insertedRows,
    updatedRows,
    skippedRows: plan.totalRows - insertedRows - updatedRows,
    invalidRows: rowErrors.length,
    createdFields,
    rowErrors,
  };
}

function importRowErrors(plan: CsvImportPlan) {
  return plan.rows
    .filter((row) => !row.valid)
    .map((row) => ({ row: row.index, errors: row.issues.map((issue) => issue.message) }));
}

function blockedReport(
  plan: CsvImportPlan,
  mode: ImportMode,
  targetMode: ImportTargetMode,
  tableId: string,
  tableNameValue: string,
  rowErrors: { row: number; errors: string[] }[]
): CsvImportCommitReport {
  return {
    jobId: importJobId(),
    status: "completed_with_errors",
    mode,
    targetMode,
    tableId,
    tableName: tableNameValue,
    totalRows: plan.totalRows,
    insertedRows: 0,
    updatedRows: 0,
    skippedRows: plan.invalidRows,
    invalidRows: plan.invalidRows,
    createdFields: [],
    rowErrors,
  };
}

async function insertPlannedFields(tx: ImportTx, tableId: string, plan: CsvImportPlan) {
  const createdFields: FieldDTO[] = [];
  const tempToFieldId = new Map<string, string>();
  for (const [position, column] of plan.columns.filter((item) => item.action === "create").entries()) {
    if (!column.tempFieldId || !column.fieldName || !column.type) continue;
    const defaults = FIELD_TYPE_META[column.type].defaultOptions ?? {};
    const [field] = await tx.insert(fields).values({
      tableId,
      name: column.fieldName,
      type: column.type,
      options: { ...defaults, ...(column.options ?? {}) },
      position,
      isPrimary: position === 0,
    }).returning();
    createdFields.push(field as FieldDTO);
    tempToFieldId.set(column.tempFieldId, field.id);
  }
  if (createdFields.length === 0) throw new Error("Import needs at least one field");
  return { createdFields, tempToFieldId, persistedFields: createdFields };
}

async function insertPlannedRows(
  tx: ImportTx,
  tableId: string,
  userId: string,
  tableFields: FieldDTO[],
  plan: CsvImportPlan,
  tempToFieldId: Map<string, string>,
  mode: ImportMode,
  rowErrors: { row: number; errors: string[] }[]
) {
  let insertedRows = 0;
  for (const [position, row] of plan.rows.filter((item) => item.valid).entries()) {
    try {
      const cells = normalizeInitialCells(tableFields, translateTempFieldIds(row.cells, tempToFieldId));
      validateRequiredFields(tableFields, cells);
      await tx.insert(records).values({ tableId, position, cells, createdBy: userId, updatedBy: userId });
      insertedRows++;
    } catch (err) {
      rowErrors.push({ row: row.index, errors: [err instanceof Error ? err.message : "Row write failed"] });
      if (mode === "strict") throw err;
    }
  }
  return insertedRows;
}

async function assertTableBelongsToBase(tableId: string, baseId: string) {
  const table = await db.query.tables.findFirst({ where: eq(tables.id, tableId) });
  if (!table || table.baseId !== baseId) throw new Error("Table not found in base");
}

async function tableName(tableId: string) {
  const table = await db.query.tables.findFirst({ where: eq(tables.id, tableId) });
  return table?.name ?? "";
}

async function firstGridViewId(tableId: string) {
  const view = await db.query.views.findFirst({ where: eq(views.tableId, tableId), orderBy: asc(views.position) });
  return view?.id;
}

function cleanTableName(name?: string) {
  const trimmed = name?.trim();
  return trimmed ? trimmed.slice(0, 255) : null;
}

function suggestedTableName(csv: string) {
  const headerLine = csv.split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  if (headerLine.includes("questionnaire")) return "Questionnaires";
  if (headerLine.includes("customer") || headerLine.includes("client")) return "Customers";
  if (headerLine.includes("task")) return "Tasks";
  return "Imported table";
}

function importJobId() {
  return `imp_${nanoid(16)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

function translateTempFieldIds(cells: Record<string, unknown>, tempToFieldId: Map<string, string>) {
  return Object.fromEntries(Object.entries(cells).map(([fieldId, value]) => [tempToFieldId.get(fieldId) ?? fieldId, value]));
}

async function rollbackImport(createdFields: FieldDTO[], insertedRecordIds: string[]) {
  if (insertedRecordIds.length) await db.delete(records).where(inArray(records.id, insertedRecordIds));
  for (const field of [...createdFields].reverse()) await deleteField(field.id);
}

export async function exportTableCsv(tableId: string, viewId?: string) {
  const table = await db.query.tables.findFirst({ where: eq(tables.id, tableId) });
  if (!table) throw new Error("Table not found");
  const tableFields = await db.query.fields.findMany({ where: eq(fields.tableId, tableId), orderBy: asc(fields.position) }) as FieldDTO[];
  const tableViews = await db.query.views.findMany({ where: eq(views.tableId, tableId), orderBy: asc(views.position) }) as ViewDTO[];
  const view = viewId ? tableViews.find((item) => item.id === viewId) : undefined;
  if (viewId && !view) throw new Error("View not found");

  const rawRecords = (await listRecords(tableId, 100_000, 0)).map(toRecordDTO);
  await enrichRecords(tableId, rawRecords as { id: string; cells: Record<string, unknown> }[]);
  const exportedRecords = view ? applyFilterSort(rawRecords, tableFields, view.config) : rawRecords;
  const visibleFields = visibleFieldsForExport(tableFields, view);
  const resolver = new ValueResolver(tableFields);
  const rows = exportedRecords.map((record) =>
    visibleFields.map((field) => serializeExportValue(resolver.resolveField(field, record, "export")))
  );

  return {
    filename: `${safeFilename(table.name)}${view ? `-${safeFilename(view.name)}` : ""}.csv`,
    csv: stringifyCsvMatrix(visibleFields.map((field) => field.name), rows),
  };
}

function visibleFieldsForExport(tableFields: FieldDTO[], view?: ViewDTO): FieldDTO[] {
  const hidden = new Set(view?.config.hiddenFieldIds ?? []);
  const order = view?.config.fieldOrder ?? [];
  const byId = new Map(tableFields.map((field) => [field.id, field]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as FieldDTO[];
  const seen = new Set(ordered.map((field) => field.id));
  return [...ordered, ...tableFields.filter((field) => !seen.has(field.id))]
    .filter((field) => !hidden.has(field.id));
}

function serializeExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
}

function safeFilename(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "export";
}

export async function exportBaseBackup(baseId: string) {
  const base = await db.query.bases.findFirst({ where: eq(bases.id, baseId) });
  if (!base) throw new Error("Base not found");
  const tableRows = await db.query.tables.findMany({ where: eq(tables.baseId, baseId), orderBy: asc(tables.position) });
  const tableIds = tableRows.map((table) => table.id);
  const fieldRows = tableIds.length ? await db.query.fields.findMany({ where: inArray(fields.tableId, tableIds), orderBy: asc(fields.position) }) : [];
  const viewRows = tableIds.length ? await db.query.views.findMany({ where: inArray(views.tableId, tableIds), orderBy: asc(views.position) }) : [];
  const recordRows = tableIds.length ? await db.query.records.findMany({ where: inArray(records.tableId, tableIds), orderBy: asc(records.position) }) : [];
  const fieldIds = fieldRows.map((field) => field.id);
  const links = fieldIds.length ? await db.query.recordLinks.findMany({ where: inArray(recordLinks.fieldId, fieldIds) }) : [];

  return {
    exportedAt: new Date().toISOString(),
    base,
    tables: tableRows.map((table) => ({
      table,
      fields: fieldRows.filter((field) => field.tableId === table.id),
      views: viewRows.filter((view) => view.tableId === table.id),
      records: recordRows.filter((record) => record.tableId === table.id),
    })),
    links,
  };
}

export function previewAirtableImport(source: AirtableBaseSource) {
  return planAirtableImport(source);
}
