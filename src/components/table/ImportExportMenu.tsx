"use client";

import { Download, FileJson, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { useTable } from "@/components/table/TableProvider";
import type { CsvImportPlan, ImportMode } from "@/lib/import-export";

interface CommitReport {
  status: "completed" | "completed_with_errors";
  totalRows: number;
  insertedRows: number;
  skippedRows: number;
  createdFields: { id: string; name: string }[];
  rowErrors: { row: number; errors: string[] }[];
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
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  const csvExportUrl = useMemo(() => {
    if (!table) return "#";
    const params = activeView ? `?viewId=${encodeURIComponent(activeView.id)}` : "";
    return `/api/tables/${table.id}/export/csv${params}`;
  }, [activeView, table]);

  if (!table) return null;

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

          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPlan(null);
              setReport(null);
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
