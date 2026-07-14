import { asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { parseCsv, stringifyCsv } from "@/lib/csv";
import {
  buildCsvImportPlan,
  planAirtableImport,
  type AirtableBaseSource,
  type CsvImportMappingInput,
  type CsvImportPlan,
  type ImportMode,
} from "@/lib/import-export";
import { applyFilterSort } from "@/lib/query";
import type { FieldDTO, RecordDTO, ViewDTO } from "@/lib/types";
import { ValueResolver } from "@/lib/value-resolver";
import { db } from "@/server/db";
import { bases, fields, recordLinks, records, tables, views, type FieldType } from "@/server/db/schema";
import { createField, deleteField } from "@/server/services/fields";
import { createRecord, listRecords } from "@/server/services/records";
import { enrichRecords } from "@/server/services/links";
import { toRecordDTO } from "@/server/services/record-dto";

export interface CsvImportRequest {
  csv: string;
  mode?: ImportMode;
  mappings?: CsvImportMappingInput[];
  createMissingFields?: boolean;
}

export interface CsvImportCommitReport {
  jobId: string;
  status: "completed" | "completed_with_errors";
  mode: ImportMode;
  totalRows: number;
  insertedRows: number;
  skippedRows: number;
  invalidRows: number;
  createdFields: FieldDTO[];
  rowErrors: { row: number; errors: string[] }[];
}

const IMPORT_BATCH_SIZE = 500;

export async function previewCsvImport(tableId: string, request: CsvImportRequest): Promise<CsvImportPlan> {
  const parsed = parseCsv(request.csv);
  const [tableFields, tableRecordRows] = await Promise.all([
    db.query.fields.findMany({ where: eq(fields.tableId, tableId), orderBy: asc(fields.position) }) as Promise<FieldDTO[]>,
    db.query.records.findMany({ where: eq(records.tableId, tableId) }),
  ]);
  return buildCsvImportPlan(parsed, tableFields, tableRecordRows.map(toRecordDTO), {
    mappings: request.mappings,
    createMissingFields: request.createMissingFields,
  });
}

export async function commitCsvImport(
  tableId: string,
  userId: string,
  request: CsvImportRequest
): Promise<CsvImportCommitReport> {
  const mode = request.mode ?? "strict";
  const plan = await previewCsvImport(tableId, request);
  const rowErrors = plan.rows
    .filter((row) => !row.valid)
    .map((row) => ({ row: row.index, errors: row.issues.map((issue) => issue.message) }));

  if (mode === "strict" && plan.invalidRows > 0) {
    return {
      jobId: importJobId(),
      status: "completed_with_errors",
      mode,
      totalRows: plan.totalRows,
      insertedRows: 0,
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
      totalRows: plan.totalRows,
      insertedRows,
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
    Object.fromEntries(visibleFields.map((field) => [field.name, serializeExportValue(resolver.resolveField(field, record, "export"))]))
  );

  return {
    filename: `${safeFilename(table.name)}${view ? `-${safeFilename(view.name)}` : ""}.csv`,
    csv: stringifyCsv(visibleFields.map((field) => field.name), rows),
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
