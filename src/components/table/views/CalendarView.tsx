"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { RecordModal } from "@/components/table/RecordModal";
import { CellDisplay } from "@/components/Cell";
import { computeCellValue } from "@/lib/compute";
import type { RecordDTO } from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CalendarView() {
  const { fields, records, config, updateConfig } = useTable();
  const [open, setOpen] = useState<RecordDTO | null>(null);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const dateFields = fields.filter((f) => f.type === "date" || f.type === "dateTime");
  const dateFieldId = config.dateFieldId ?? dateFields[0]?.id ?? null;
  const dateField = fields.find((f) => f.id === dateFieldId);
  const primary = fields.find((f) => f.isPrimary) ?? fields[0];

  const rows = records;

  const byDay = useMemo(() => {
    const map = new Map<string, RecordDTO[]>();
    if (!dateField) return map;
    for (const r of rows) {
      const v = r.cells[dateField.id];
      if (!v) continue;
      const key = ymd(new Date(v as string));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows, dateField]);

  if (!dateField) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <p>Calendar needs a date field.</p>
        {dateFields.length > 0 && (
          <select className="rounded-lg border border-border-token px-2 py-1 text-sm" defaultValue="" onChange={(e) => updateConfig({ dateFieldId: e.target.value })}>
            <option value="" disabled>Choose a field…</option>
            {dateFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
    );
  }

  // Build the 6-week grid.
  const first = new Date(cursor.year, cursor.month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const monthLabel = first.toLocaleString(undefined, { month: "long", year: "numeric" });
  const shift = (n: number) => setCursor((c) => {
    const d = new Date(c.year, c.month + n, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border-token px-3 py-2">
        <button onClick={() => shift(-1)} className="text-muted hover:text-foreground"><ChevronLeft size={18} /></button>
        <span className="min-w-40 text-sm font-medium">{monthLabel}</span>
        <button onClick={() => shift(1)} className="text-muted hover:text-foreground"><ChevronRight size={18} /></button>
        <div className="ml-auto flex items-center gap-1.5 text-sm text-muted">
          by
          <select value={dateField.id} onChange={(e) => updateConfig({ dateFieldId: e.target.value })} className="rounded border border-border-token px-1.5 py-0.5 text-sm">
            {dateFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-border-token text-center text-xs text-muted">
        {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.month;
          const recs = byDay.get(ymd(d)) ?? [];
          return (
            <div key={i} className={"thin-scroll overflow-auto border-b border-r border-border-token p-1 " + (inMonth ? "" : "bg-surface/50 text-muted")}>
              <div className="mb-1 text-right text-xs">{d.getDate()}</div>
              <div className="space-y-1">
                {recs.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setOpen(r)}
                    className="block w-full truncate rounded bg-accent/10 px-1.5 py-0.5 text-left text-xs text-accent hover:bg-accent/20"
                  >
                    {primary ? <CellDisplay field={primary} value={computeCellValue(primary, r, fields)} /> : "Record"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {open && <RecordModal record={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
