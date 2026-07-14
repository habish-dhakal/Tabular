"use client";

import { Download, FileJson, FileUp, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { useTable } from "@/components/table/TableProvider";
import { parseCsv } from "@/lib/csv";
import { formatCsvUploadSize, validateCsvUploadCandidate } from "@/lib/import-upload";
import type { CsvImportPlan, ImportMode } from "@/lib/import-export";

interface CommitReport {
  status: "completed" | "completed_with_errors";
  totalRows: number;
  insertedRows: number;
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
  const { table, activeView, reloadTable } = useTable();
  const [csv, setCsv] = useState("");
  const [mode, setMode] = useState<ImportMode>("strict");
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
    } catch (err) {
      setCsv("");
      setError(err instanceof Error ? err.message : "CSV could not be read");
    }
  }

  function clearCsv() {
    setCsv("");
    setFileInfo(null);
    resetImportFeedback();
  }

  async function previewImport() {
    setBusy("preview");
    setError("");
    setReport(null);
    try {
      const res = await fetch(`/api/tables/${table!.id}/import/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Preview failed");
      setPlan(body);
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function commitImport(close: () => void) {
    setBusy("commit");
    setError("");
    try {
      const res = await fetch(`/api/tables/${table!.id}/import/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Import failed");
      setReport(body);
      setPlan(null);
      await reloadTable();
      if (body.status === "completed") close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Popover
      width={520}
      align="right"
      trigger={(open) => <TriggerButton active={open || !!plan || !!report} />}
    >
      {(close) => (
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <a
              href={csvExportUrl}
              className="flex items-center gap-2 rounded-md border border-border-token px-2.5 py-2 text-foreground hover:bg-surface"
            >
              <Download size={15} />
              Export CSV
            </a>
            <a
              href={`/api/bases/${table.baseId}/export/json`}
              className="flex items-center gap-2 rounded-md border border-border-token px-2.5 py-2 text-foreground hover:bg-surface"
            >
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
                  <button
                    type="button"
                    onClick={clearCsv}
                    className="flex items-center gap-1 rounded-md border border-border-token px-2 py-1 text-xs text-muted hover:bg-surface"
                  >
                    <X size={13} />
                    Clear
                  </button>
                )}
                <label
                  data-testid="csv-upload-button"
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border-token px-2.5 py-1 text-xs text-foreground hover:bg-surface"
                >
                  <FileUp size={14} />
                  Upload CSV
                  <input
                    data-testid="csv-file-input"
                    type="file"
                    accept=".csv,text/csv,application/csv"
                    className="sr-only"
                    onClick={(e) => {
                      e.currentTarget.value = "";
                    }}
                    onChange={(e) => void chooseCsvFile(e.currentTarget.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
          </div>

          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setFileInfo(null);
              resetImportFeedback();
            }}
            rows={7}
            spellCheck={false}
            placeholder={"Name,Status\nQuestionnaire A,Todo"}
            className="w-full resize-none rounded-md border border-border-token bg-background p-2 font-mono text-xs outline-none focus:border-accent"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-muted">
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ImportMode)}
                className="rounded border border-border-token bg-background px-2 py-1 text-foreground"
              >
                <option value="strict">Strict</option>
                <option value="partial">Partial</option>
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                data-testid="csv-preview-button"
                onClick={previewImport}
                disabled={!csv.trim() || busy !== null}
                className="rounded-md border border-border-token px-2.5 py-1 text-foreground hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "preview" ? "Previewing..." : "Preview"}
              </button>
              <button
                onClick={() => commitImport(close)}
                disabled={!csv.trim() || busy !== null}
                className="rounded-md bg-accent px-2.5 py-1 text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "commit" ? "Importing..." : "Import"}
              </button>
            </div>
          </div>

          {error && <p className="rounded-md bg-red-50 px-2 py-1.5 text-red-700">{error}</p>}
          {plan && <ImportPlanSummary plan={plan} />}
          {report && <CommitReportSummary report={report} />}
        </div>
      )}
    </Popover>
  );
}

function ImportPlanSummary({ plan }: { plan: CsvImportPlan }) {
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
        <p className="mt-1 text-muted">
          New fields: {created.map((column) => `${column.fieldName} (${column.type})`).join(", ")}
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

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function CommitReportSummary({ report }: { report: CommitReport }) {
  return (
    <div className="rounded-md border border-border-token bg-surface/50 p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">Import {report.status === "completed" ? "complete" : "completed with errors"}</span>
        <span className="text-muted">
          {report.insertedRows} inserted, {report.skippedRows} skipped
        </span>
      </div>
      {report.createdFields.length > 0 && (
        <p className="mt-1 text-muted">
          Created fields: {report.createdFields.map((field) => field.name).join(", ")}
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
