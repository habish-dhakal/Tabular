"use client";

import { Download, Eye, FileJson, FileUp, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@/components/ui/Popover";
import { useTable } from "@/components/table/TableProvider";
import { parseCsv } from "@/lib/csv";
import { formatCsvUploadSize, validateCsvUploadCandidate } from "@/lib/import-upload";
import type { CsvImportPlan, ImportMode, ImportTargetMode } from "@/lib/import-export";
import type { FieldType } from "@/server/db/schema";

interface CommitReport {
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
  createdFields: { id: string; name: string }[];
  rowErrors: { row: number; errors: string[] }[];
}

interface CsvFileInfo {
  name: string;
  size: number;
  rows: number;
  columns: number;
}

const TARGET_MODES: { value: ImportTargetMode; label: string }[] = [
  { value: "create", label: "Create table" },
  { value: "append", label: "Append" },
  { value: "replace", label: "Replace" },
  { value: "merge", label: "Merge" },
];

const WRITABLE_TYPES: FieldType[] = [
  "singleLineText",
  "longText",
  "number",
  "currency",
  "percent",
  "checkbox",
  "singleSelect",
  "multiSelect",
  "date",
  "dateTime",
  "url",
  "email",
  "phone",
  "rating",
  "duration",
];

function TriggerButton({ active }: { active?: boolean }) {
  return (
    <button
      className={
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition " +
        (active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface")
      }
    >
      <Upload size={14} />
      Import / Export
    </button>
  );
}

export function ImportExportMenu() {
  const router = useRouter();
  const { table, fields, activeView, reloadTable } = useTable();
  const [csv, setCsv] = useState("");
  const [targetMode, setTargetMode] = useState<ImportTargetMode>("create");
  const [mode, setMode] = useState<ImportMode>("strict");
  const [tableName, setTableName] = useState("");
  const [mergeFieldId, setMergeFieldId] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [mappings, setMappings] = useState<Record<string, FieldType>>({});
  const [plan, setPlan] = useState<CsvImportPlan | null>(null);
  const [report, setReport] = useState<CommitReport | null>(null);
  const [error, setError] = useState("");
  const [fileInfo, setFileInfo] = useState<CsvFileInfo | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  const csvExportUrl = useMemo(() => {
    if (!table) return "#";
    const params = activeView ? `?viewId=${encodeURIComponent(activeView.id)}` : "";
    return `/api/tables/${table.id}/export/csv${params}`;
  }, [activeView, table]);

  if (!table) return null;

  function resetImportFeedback() {
    setPlan(null);
    setReport(null);
    setError("");
  }

  async function chooseCsvFile(file: File | null) {
    resetImportFeedback();
    setFileInfo(null);
    if (!file) return;

    const fileError = validateCsvUploadCandidate(file);
    if (fileError) {
      setCsv("");
      setError(fileError);
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setCsv(text);
      setFileInfo({ name: file.name, size: file.size, rows: parsed.rows.length, columns: parsed.headers.length });
      setTableName(suggestTableName(file.name, parsed.headers));
    } catch (err) {
      setCsv("");
      setError(err instanceof Error ? err.message : "CSV could not be read");
    }
  }

  function clearCsv() {
    setCsv("");
    setFileInfo(null);
    setMappings({});
    setMergeFieldId("");
    resetImportFeedback();
  }

  function requestBody() {
    return {
      csv,
      mode,
      targetMode,
      tableId: targetMode === "create" ? undefined : table!.id,
      tableName: targetMode === "create" || targetMode === "replace" ? tableName : undefined,
      mergeFieldId: targetMode === "merge" ? mergeFieldId : undefined,
      confirmReplace: targetMode === "replace" ? confirmReplace : undefined,
      mappings: Object.entries(mappings).map(([header, type]) => ({ header, action: "create" as const, type })),
    };
  }

  async function previewImport() {
    setBusy("preview");
    setError("");
    setReport(null);
    try {
      const res = await fetch(`/api/bases/${table!.baseId}/import/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Preview failed");
      setPlan(body);
      if (targetMode === "merge" && !mergeFieldId) {
        const candidate = body.mergeCandidates?.find((item: { fieldId?: string }) => item.fieldId);
        if (candidate?.fieldId) setMergeFieldId(candidate.fieldId);
      }
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function commitImport() {
    setBusy("commit");
    setError("");
    try {
      const res = await fetch(`/api/bases/${table!.baseId}/import/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      setReport(body);
      setPlan(null);
      await reloadTable();
      if (body.tableId) navigateToReport(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  function navigateToReport(nextReport: Pick<CommitReport, "tableId" | "viewId">) {
    const params = new URLSearchParams({ table: nextReport.tableId });
    if (nextReport.viewId) params.set("view", nextReport.viewId);
    router.push(`/base/${table!.baseId}?${params.toString()}`);
    router.refresh();
  }

  const canCommit = csv.trim() && busy === null && (targetMode !== "replace" || confirmReplace) && (targetMode !== "merge" || mergeFieldId);

  return (
    <Popover
      width={760}
      align="right"
      trigger={(open) => <TriggerButton active={open || !!plan || !!report} />}
    >
      {() => (
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={csvExportUrl} className="flex items-center gap-2 rounded-md border border-border-token px-2.5 py-2 text-foreground hover:bg-surface">
              <Download size={15} />
              Export CSV
            </a>
            <a href={`/api/bases/${table.baseId}/export/json`} className="flex items-center gap-2 rounded-md border border-border-token px-2.5 py-2 text-foreground hover:bg-surface">
              <FileJson size={15} />
              Backup JSON
            </a>
          </div>

          <div className="rounded-md border border-dashed border-border-token p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">CSV import</p>
                {fileInfo ? (
                  <p data-testid="csv-file-summary" className="text-xs text-muted">
                    {fileInfo.name} · {formatCsvUploadSize(fileInfo.size)} · {formatCount(fileInfo.rows, "row")} · {formatCount(fileInfo.columns, "column")}
                  </p>
                ) : (
                  <p className="text-xs text-muted">No file selected</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {csv && (
                  <button type="button" onClick={clearCsv} className="flex items-center gap-1 rounded-md border border-border-token px-2 py-1 text-xs text-muted hover:bg-surface">
                    <X size={13} />
                    Clear
                  </button>
                )}
                <label data-testid="csv-upload-button" className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-token px-2.5 py-1 text-xs text-foreground hover:bg-surface">
                  <FileUp size={14} />
                  Upload CSV
                  <input
                    data-testid="csv-file-input"
                    type="file"
                    accept=".csv,text/csv,application/csv"
                    className="sr-only"
                    onClick={(e) => { e.currentTarget.value = ""; }}
                    onChange={(e) => void chooseCsvFile(e.currentTarget.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-2 lg:grid-cols-[1fr_220px]">
            <textarea
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setFileInfo(null);
                resetImportFeedback();
              }}
              rows={9}
              spellCheck={false}
              placeholder={"Questionnaire,Task Status\nQ-1,Done"}
              className="w-full resize-none rounded-md border border-border-token bg-background p-2 font-mono text-xs outline-none focus:border-accent"
            />
            <div className="space-y-2 rounded-md border border-border-token p-2">
              <div className="grid grid-cols-2 gap-1">
                {TARGET_MODES.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => {
                      setTargetMode(item.value);
                      resetImportFeedback();
                    }}
                    className={
                      "rounded border px-2 py-1 text-xs " +
                      (targetMode === item.value ? "border-accent bg-accent/10 text-accent" : "border-border-token text-muted hover:bg-surface")
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {(targetMode === "create" || targetMode === "replace") && (
                <label className="block text-xs text-muted">
                  Table name
                  <input value={tableName} onChange={(e) => setTableName(e.target.value)} className="mt-1 w-full rounded border border-border-token bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent" />
                </label>
              )}
              {targetMode === "merge" && (
                <label className="block text-xs text-muted">
                  Match field
                  <select value={mergeFieldId} onChange={(e) => setMergeFieldId(e.target.value)} className="mt-1 w-full rounded border border-border-token bg-background px-2 py-1 text-sm text-foreground">
                    <option value="">Choose field</option>
                    {fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-xs text-muted">
                Error handling
                <select value={mode} onChange={(e) => setMode(e.target.value as ImportMode)} className="mt-1 w-full rounded border border-border-token bg-background px-2 py-1 text-sm text-foreground">
                  <option value="strict">Strict rollback</option>
                  <option value="partial">Partial import</option>
                </select>
              </label>
              {targetMode === "replace" && (
                <label className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} className="mt-0.5" />
                  Replace this table schema and rows
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted">
              {targetMode === "create" ? "New table" : `Current table: ${table.name}`}
            </div>
            <div className="flex items-center gap-2">
              <button data-testid="csv-preview-button" onClick={previewImport} disabled={!csv.trim() || busy !== null} className="rounded-md border border-border-token px-2.5 py-1 text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50">
                {busy === "preview" ? "Previewing..." : "Preview"}
              </button>
              <button onClick={commitImport} disabled={!canCommit} className="rounded-md bg-accent px-2.5 py-1 text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {busy === "commit" ? "Importing..." : "Import"}
              </button>
            </div>
          </div>

          {error && <p className="rounded-md bg-red-50 px-2 py-1.5 text-red-700">{error}</p>}
          {plan && <ImportPlanSummary plan={plan} mappings={mappings} onTypeChange={(header, type) => setMappings((prev) => ({ ...prev, [header]: type }))} />}
          {report && <CommitReportSummary report={report} onView={() => navigateToReport(report)} />}
        </div>
      )}
    </Popover>
  );
}

function ImportPlanSummary({
  plan,
  mappings,
  onTypeChange,
}: {
  plan: CsvImportPlan;
  mappings: Record<string, FieldType>;
  onTypeChange: (header: string, type: FieldType) => void;
}) {
  const created = plan.columns.filter((column) => column.action === "create");
  return (
    <div className="rounded-md border border-border-token bg-surface/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Preview</span>
        <span className={plan.invalidRows ? "text-red-700" : "text-muted"}>
          {plan.validRows}/{plan.totalRows} rows valid
        </span>
      </div>
      {created.length > 0 && (
        <div className="mt-2 grid max-h-48 gap-1 overflow-auto pr-1 sm:grid-cols-2">
          {created.slice(0, 24).map((column) => (
            <label key={column.header} className="flex items-center justify-between gap-2 rounded border border-border-token bg-background px-2 py-1 text-xs">
              <span className="min-w-0">
                <span className="block truncate font-medium">{column.fieldName}</span>
                <span className="block truncate text-muted">{Math.round((column.inference?.confidence ?? 0) * 100)}% · {column.inference?.reasons[0] ?? "mapped"}</span>
              </span>
              <select value={mappings[column.header] ?? column.type} onChange={(e) => onTypeChange(column.header, e.target.value as FieldType)} className="w-32 rounded border border-border-token bg-background px-1 py-0.5 text-xs">
                {WRITABLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {plan.relationshipSuggestions.length > 0 && (
        <div className="mt-2 rounded border border-accent/20 bg-accent/5 px-2 py-1.5 text-xs text-muted">
          {plan.relationshipSuggestions.map((item) => (
            <p key={`${item.tableName}-${item.keyHeader}`}>
              Suggested split: {item.tableName} by {item.keyHeader} ({item.uniqueEntities} entities)
            </p>
          ))}
        </div>
      )}
      {plan.mergeCandidates.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Merge candidates: {plan.mergeCandidates.slice(0, 3).map((item) => `${item.header} ${Math.round(item.confidence * 100)}%`).join(", ")}
        </p>
      )}
      {plan.previewRows.some((row) => !row.valid) && (
        <div className="mt-2 space-y-1">
          {plan.previewRows.filter((row) => !row.valid).slice(0, 3).map((row) => (
            <p key={row.index} className="text-red-700">
              Row {row.index}: {row.issues.map((issue) => issue.message).join("; ")}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function CommitReportSummary({ report, onView }: { report: CommitReport; onView: () => void }) {
  return (
    <div className="rounded-md border border-border-token bg-surface/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Import {report.status === "completed" ? "complete" : "completed with errors"}</span>
        <span className="text-muted">
          {report.insertedRows} inserted, {report.updatedRows} updated, {report.skippedRows} skipped
        </span>
      </div>
      <button onClick={onView} className="mt-2 flex items-center gap-1 rounded border border-border-token px-2 py-1 text-xs text-foreground hover:bg-surface">
        <Eye size={13} />
        View {report.tableName}
      </button>
      {report.createdFields.length > 0 && (
        <p className="mt-1 text-muted">
          Created fields: {report.createdFields.slice(0, 12).map((field) => field.name).join(", ")}
        </p>
      )}
      {report.rowErrors.slice(0, 3).map((row) => (
        <p key={row.row} className="mt-1 text-red-700">
          Row {row.row}: {row.errors.join("; ")}
        </p>
      ))}
    </div>
  );
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function suggestTableName(filename: string, headers: string[]) {
  const headerText = headers.join(" ").toLowerCase();
  if (headerText.includes("questionnaire")) return "Questionnaires";
  if (headerText.includes("customer") || headerText.includes("client")) return "Customers";
  if (headerText.includes("task")) return "Tasks";
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Imported table";
}
