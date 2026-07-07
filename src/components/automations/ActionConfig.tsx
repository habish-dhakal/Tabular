"use client";

import { Plus, X } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { TokenInput } from "@/components/automations/TokenInput";
import { SlackChannelPicker } from "@/components/automations/SlackChannelPicker";
import type { ActionType } from "@/lib/types";

type Config = Record<string, unknown>;

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted">{children}</label>;
}

const inputCls =
  "w-full rounded-md border border-border-token bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

/** Ordered list of `{ [name]: value }` rows (used for cells + headers). */
function KeyValueList({
  value,
  onChange,
  keyPlaceholder,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder: string;
}) {
  const entries = Object.entries(value);
  const setEntry = (i: number, k: string, v: string) => {
    const next: Record<string, string> = {};
    entries.forEach(([ek, ev], j) => { next[j === i ? k : ek] = j === i ? v : ev; });
    onChange(next);
  };
  const remove = (i: number) => onChange(Object.fromEntries(entries.filter((_, j) => j !== i)));
  const add = () => onChange({ ...value, "": "" });

  return (
    <div className="space-y-1.5">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex items-start gap-1.5">
          <input
            value={k}
            placeholder={keyPlaceholder}
            onChange={(e) => setEntry(i, e.target.value, v)}
            className={inputCls + " w-2/5"}
          />
          <div className="flex-1">
            <TokenInput value={v} onChange={(nv) => setEntry(i, k, nv)} />
          </div>
          <button onClick={() => remove(i)} className="mt-1.5 text-muted hover:text-red-600"><X size={14} /></button>
        </div>
      ))}
      <button onClick={add} className="flex items-center gap-1 text-sm text-accent hover:underline">
        <Plus size={14} /> Add
      </button>
    </div>
  );
}

/** Ordered list of plain string values (Google Sheet row cells). */
function StringList({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {value.map((v, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="mt-1.5 w-6 shrink-0 text-right text-xs text-muted">{i + 1}</span>
          <div className="flex-1">
            <TokenInput value={v} onChange={(nv) => onChange(value.map((x, j) => (j === i ? nv : x)))} />
          </div>
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="mt-1.5 text-muted hover:text-red-600"><X size={14} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...value, ""])} className="flex items-center gap-1 text-sm text-accent hover:underline">
        <Plus size={14} /> Add column
      </button>
    </div>
  );
}

export function ActionConfig({
  type,
  config,
  onChange,
}: {
  type: ActionType;
  config: Config;
  onChange: (next: Config) => void;
}) {
  const { tables, table } = useTable();
  const set = (patch: Config) => onChange({ ...config, ...patch });
  const str = (k: string) => String(config[k] ?? "");

  switch (type) {
    case "sendEmail":
      return (
        <div className="space-y-3">
          <div><Label>To</Label><TokenInput value={str("to")} onChange={(v) => set({ to: v })} placeholder="name@example.com" /></div>
          <div><Label>Subject</Label><TokenInput value={str("subject")} onChange={(v) => set({ subject: v })} /></div>
          <div><Label>Body</Label><TokenInput multiline value={str("body")} onChange={(v) => set({ body: v })} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Cc</Label><TokenInput value={str("cc")} onChange={(v) => set({ cc: v })} /></div>
            <div><Label>Bcc</Label><TokenInput value={str("bcc")} onChange={(v) => set({ bcc: v })} /></div>
          </div>
        </div>
      );

    case "sendSlack":
      return (
        <div className="space-y-3">
          <div><Label>Send to</Label><SlackChannelPicker value={str("channel")} onChange={(v) => set({ channel: v })} /></div>
          <div><Label>Message</Label><TokenInput multiline value={str("text")} onChange={(v) => set({ text: v })} /></div>
        </div>
      );

    case "appendGoogleSheet":
      return (
        <div className="space-y-3">
          <div><Label>Spreadsheet ID</Label><TokenInput value={str("spreadsheetId")} onChange={(v) => set({ spreadsheetId: v })} /></div>
          <div><Label>Sheet name (optional)</Label><TokenInput value={str("sheetName")} onChange={(v) => set({ sheetName: v })} placeholder="Sheet1" /></div>
          <div><Label>Row values</Label><StringList value={(config.values as string[]) ?? []} onChange={(v) => set({ values: v })} /></div>
        </div>
      );

    case "createRecord":
      return (
        <div className="space-y-3">
          <div>
            <Label>Table</Label>
            <select value={str("tableId")} onChange={(e) => set({ tableId: e.target.value })} className={inputCls}>
              <option value="">Select a table…</option>
              {tables.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === table?.id ? " (this table)" : ""}</option>)}
            </select>
          </div>
          <div><Label>Field values (by field name)</Label>
            <KeyValueList value={(config.cells as Record<string, string>) ?? {}} onChange={(v) => set({ cells: v })} keyPlaceholder="Field name" />
          </div>
        </div>
      );

    case "updateRecord":
      return (
        <div className="space-y-3">
          <div><Label>Record ID</Label><TokenInput value={str("recordId")} onChange={(v) => set({ recordId: v })} placeholder="rec_… or {{token}}" /></div>
          <div><Label>Field values (by field name)</Label>
            <KeyValueList value={(config.cells as Record<string, string>) ?? {}} onChange={(v) => set({ cells: v })} keyPlaceholder="Field name" />
          </div>
        </div>
      );

    case "runScript":
      return (
        <div className="space-y-2">
          <Label>JavaScript</Label>
          <textarea
            data-testid="script-code"
            value={str("code")}
            onChange={(e) => set({ code: e.target.value })}
            spellCheck={false}
            rows={8}
            placeholder={"// input.record = this record's fields (by name)\n// input.item  = current loop item (or null)\nconst total = input.record.Score * 2;\noutput.set('doubled', total);"}
            className="w-full rounded-md border border-border-token bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
          />
          <p className="rounded bg-background px-2 py-1 text-xs text-muted">
            Sandboxed &amp; synchronous — no network or file access. Read <code className="text-foreground">input.record</code> / <code className="text-foreground">input.item</code>, emit with <code className="text-foreground">output.set(key, value)</code>, then use <code className="text-foreground">{"{{output.key}}"}</code> in later steps.
          </p>
        </div>
      );

    case "httpRequest":
      return (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="w-28">
              <Label>Method</Label>
              <select value={config.method ? str("method") : "POST"} onChange={(e) => set({ method: e.target.value })} className={inputCls}>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex-1"><Label>URL</Label><TokenInput value={str("url")} onChange={(v) => set({ url: v })} placeholder="https://…" /></div>
          </div>
          <div><Label>Headers</Label>
            <KeyValueList value={(config.headers as Record<string, string>) ?? {}} onChange={(v) => set({ headers: v })} keyPlaceholder="Header" />
          </div>
          <div><Label>Body</Label><TokenInput multiline value={str("body")} onChange={(v) => set({ body: v })} /></div>
        </div>
      );

    default:
      return null;
  }
}
