"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseValue(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function DatePicker({
  value,
  withTime,
  onCommit,
  onClose,
}: {
  value: unknown;
  withTime: boolean;
  onCommit: (v: string | null) => void;
  onClose: () => void;
}) {
  const initial = parseValue(value);
  const today = new Date();
  const [sel, setSel] = useState<Date | null>(initial);
  const [cursor, setCursor] = useState(() => {
    const base = initial ?? today;
    return { year: base.getFullYear(), month: base.getMonth() };
  });
  const [time, setTime] = useState(
    initial
      ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}`
      : `${pad(today.getHours())}:${pad(today.getMinutes())}`
  );

  const days = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const shift = (n: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + n, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  function commitDate(day: Date) {
    if (withTime) {
      const [h, m] = time.split(":").map(Number);
      const dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
      onCommit(dt.toISOString());
    } else {
      onCommit(ymd(day));
      onClose();
    }
  }
  function pickDay(day: Date) {
    setSel(day);
    if (!withTime) commitDate(day);
    else {
      const [h, m] = time.split(":").map(Number);
      const dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
      onCommit(dt.toISOString());
    }
  }

  return (
    <div className="p-2 text-sm">
      <div className="mb-1 flex items-center justify-between px-1">
        <button onClick={() => shift(-1)} className="rounded p-1 text-muted hover:bg-surface"><ChevronLeft size={16} /></button>
        <span className="font-medium">{monthLabel}</span>
        <button onClick={() => shift(1)} className="rounded p-1 text-muted hover:bg-surface"><ChevronRight size={16} /></button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted">
        {WEEKDAYS.map((w, i) => <div key={i} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.month;
          const isSel = sel && ymd(d) === ymd(sel);
          const isToday = ymd(d) === ymd(today);
          return (
            <button
              key={i}
              onClick={() => pickDay(d)}
              className={
                "flex h-8 w-8 items-center justify-center rounded-full text-sm transition " +
                (isSel
                  ? "bg-accent font-semibold text-white"
                  : inMonth
                  ? "hover:bg-surface"
                  : "text-muted/50 hover:bg-surface") +
                (isToday && !isSel ? " ring-1 ring-accent" : "")
              }
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      {withTime && (
        <div className="mt-2 flex items-center gap-2 border-t border-border-token px-1 pt-2">
          <label className="text-xs text-muted">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              const [h, m] = e.target.value.split(":").map(Number);
              // If no day is chosen yet, changing the time implies today.
              const base = sel ?? today;
              if (!sel) setSel(base);
              const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h || 0, m || 0);
              onCommit(dt.toISOString());
            }}
            className="flex-1 rounded border border-border-token px-2 py-1 text-sm outline-none focus:border-accent"
          />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-border-token px-1 pt-2 text-xs">
        <button
          onClick={() => { onCommit(null); onClose(); }}
          className="text-muted hover:text-red-600"
        >
          Clear
        </button>
        <button
          onClick={() => { pickDay(today); if (withTime) { /* stay open */ } }}
          className="text-accent hover:underline"
        >
          Today
        </button>
        {withTime && (
          <button onClick={onClose} className="font-medium text-accent hover:underline">Done</button>
        )}
      </div>
    </div>
  );
}
