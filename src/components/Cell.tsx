"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Star } from "lucide-react";
import type { FieldDTO } from "@/lib/types";
import type { SelectChoice } from "@/lib/fields";
import { isComputed } from "@/lib/fields";
import { CellPopover } from "@/components/cell-editors/CellPopover";
import { DatePicker } from "@/components/cell-editors/DatePicker";
import { SelectMenu } from "@/components/cell-editors/SelectMenu";

function choicesOf(field: FieldDTO): SelectChoice[] {
  return (field.options.choices as SelectChoice[]) ?? [];
}

/* -------- timezone-safe date helpers -------- */
function fmtDate(v: unknown): string {
  const s = String(v);
  // Date-only ("YYYY-MM-DD") must be parsed as local, not UTC, to avoid an
  // off-by-one day shift.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString();
}
function fmtDateTime(v: unknown): string {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

function SelectBadge({ choice }: { choice: SelectChoice }) {
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: choice.color + "22", color: choice.color }}
    >
      {choice.name}
    </span>
  );
}

/** Read-only rendering of a (possibly computed) cell value.
 *  `expanded` disables single-line truncation so full text wraps. */
export function CellDisplay({ field, value, expanded }: { field: FieldDTO; value: unknown; expanded?: boolean }) {
  if (value === undefined || value === null || value === "") {
    return <span className="text-transparent">·</span>;
  }
  const textCls = expanded ? "whitespace-pre-wrap break-words" : "truncate";

  switch (field.type) {
    case "checkbox":
      return value ? <Check size={16} className="text-green-600" /> : null;

    case "singleSelect": {
      const c = choicesOf(field).find((x) => x.id === value);
      return c ? <SelectBadge choice={c} /> : <span>{String(value)}</span>;
    }

    case "multiSelect": {
      const ids = (value as string[]) ?? [];
      const cs = choicesOf(field);
      return (
        <span className="flex flex-wrap gap-1">
          {ids.map((id) => {
            const c = cs.find((x) => x.id === id);
            return c ? <SelectBadge key={id} choice={c} /> : null;
          })}
        </span>
      );
    }

    case "rating": {
      const n = Number(value) || 0;
      const max = (field.options.max as number) ?? 5;
      return (
        <span className="flex gap-0.5">
          {Array.from({ length: max }).map((_, i) => (
            <Star key={i} size={14} className={i < n ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
          ))}
        </span>
      );
    }

    case "currency": {
      const sym = (field.options.symbol as string) ?? "$";
      return <span>{sym}{Number(value).toLocaleString()}</span>;
    }
    case "percent":
      return <span>{Number(value)}%</span>;

    case "date":
      return <span>{fmtDate(value)}</span>;
    case "dateTime":
    case "createdTime":
    case "updatedTime":
      return <span>{fmtDateTime(value)}</span>;

    case "url":
      // In the grid (non-expanded) render as styled text so clicking the cell
      // edits it; only make it a real navigating link when expanded.
      return expanded ? (
        <a href={String(value)} target="_blank" rel="noreferrer" className="break-words text-accent underline">
          {String(value)}
        </a>
      ) : (
        <span className="truncate text-accent underline">{String(value)}</span>
      );

    case "email":
      return expanded ? (
        <a href={`mailto:${String(value)}`} className="break-words text-accent underline">{String(value)}</a>
      ) : (
        <span className={textCls}>{String(value)}</span>
      );

    case "link": {
      const chips = Array.isArray(value) ? (value as { id: string; label: string }[]) : [];
      if (chips.length === 0) return <span className="text-transparent">·</span>;
      return (
        <span className={expanded ? "flex flex-wrap gap-1" : "flex gap-1 overflow-hidden"}>
          {chips.map((c) => (
            <span key={c.id} className="inline-flex max-w-full items-center gap-1 truncate rounded bg-surface px-1.5 py-0.5 text-xs">
              <span className="truncate">{c.label}</span>
            </span>
          ))}
        </span>
      );
    }

    case "lookup": {
      const vals = Array.isArray(value) ? value : [value];
      if (vals.length === 0) return <span className="text-transparent">·</span>;
      return (
        <span className={expanded ? "flex flex-wrap gap-1" : "flex gap-1 overflow-hidden"}>
          {vals.map((v, i) => (
            <span key={i} className="inline-block max-w-full truncate rounded bg-surface px-1.5 py-0.5 text-xs">
              {String(v)}
            </span>
          ))}
        </span>
      );
    }

    case "rollup":
      return <span className={textCls}>{typeof value === "boolean" ? String(value) : String(value)}</span>;

    case "formula": {
      if (typeof value === "boolean") return <span>{value ? "true" : "false"}</span>;
      const s = String(value);
      return (
        <span className={textCls + (s === "#ERROR" || s === "#CYCLE" ? " text-red-600" : "")}>{s}</span>
      );
    }

    default:
      return <span className={textCls}>{String(value)}</span>;
  }
}

/* --------------------- Floating long-text editor --------------------- */
/** Long text needs more room than a grid row; render it in a body portal
 *  anchored to the cell so it is never clipped by the grid's overflow. */
function LongTextFloating({
  anchorRect,
  initial,
  onCommit,
  onCancel,
}: {
  anchorRect: DOMRect;
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [mounted]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) {
        onCommit(draft);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [draft, onCommit]);

  if (!mounted) return null;
  const width = Math.max(anchorRect.width, 320);
  const left = Math.min(anchorRect.left, window.innerWidth - width - 8);
  const top = Math.min(anchorRect.top, window.innerHeight - 200);

  return createPortal(
    <div
      className="fixed z-50 rounded-lg border border-accent bg-background p-1 shadow-lg"
      style={{ left, top, width }}
    >
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onCommit(draft);
        }}
        className="h-40 w-full resize-none rounded bg-background p-1.5 text-sm outline-none"
      />
      <div className="px-1 pb-0.5 text-[11px] text-muted">Esc to cancel · ⌘/Ctrl+Enter to save</div>
    </div>,
    document.body
  );
}

/**
 * Editable cell editor.
 *  - onCommit(v): save AND exit edit mode (used for single-shot edits)
 *  - onChange(v): save WITHOUT closing (rich pickers persist as you edit)
 *  - onCancel():  exit edit mode
 *  - anchorRect:  cell bounds, so popovers float unclipped over the grid
 */
export function CellEditor({
  field,
  value,
  onCommit,
  onCancel,
  onChange,
  anchorRect,
}: {
  field: FieldDTO;
  value: unknown;
  onCommit: (v: unknown) => void;
  onCancel: () => void;
  onChange?: (v: unknown) => void;
  anchorRect?: DOMRect | null;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string>(
    value === undefined || value === null ? "" : String(value)
  );
  const save = onChange ?? onCommit;

  const inlineTypes = new Set(["singleLineText", "url", "email", "phone", "number", "currency", "percent"]);
  useEffect(() => {
    if (!inlineTypes.has(field.type)) return;
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.type]);

  const commitText = () => onCommit(draft === "" ? null : draft);

  switch (field.type) {
    case "longText": {
      if (anchorRect) {
        return (
          <LongTextFloating
            anchorRect={anchorRect}
            initial={draft}
            onCommit={(v) => onCommit(v === "" ? null : v)}
            onCancel={onCancel}
          />
        );
      }
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitText();
          }}
          className="h-28 w-full resize-y rounded border border-accent bg-background p-1.5 text-sm outline-none"
        />
      );
    }

    case "singleSelect":
    case "multiSelect": {
      const cs = choicesOf(field);
      const menu = (
        <SelectMenu
          choices={cs}
          value={value}
          multi={field.type === "multiSelect"}
          onCommit={(v) => save(v)}
          onClose={onCancel}
        />
      );
      return anchorRect ? (
        <CellPopover anchorRect={anchorRect} onClose={onCancel} minWidth={240}>{menu}</CellPopover>
      ) : (
        <div className="rounded-lg border border-border-token">{menu}</div>
      );
    }

    case "number":
    case "currency":
    case "percent":
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft === "" ? null : Number(draft))}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") onCommit(draft === "" ? null : Number(draft));
          }}
          className="w-full rounded border border-accent bg-background p-1 text-sm outline-none"
        />
      );

    case "rating": {
      const max = (field.options.max as number) ?? 5;
      const cur = Number(value) || 0;
      return (
        <div className="flex items-center gap-0.5">
          {Array.from({ length: max }).map((_, i) => (
            <button
              key={i}
              onClick={() => onCommit(i + 1 === cur ? null : i + 1)}
              className="p-0.5"
            >
              <Star size={16} className={i < cur ? "fill-yellow-400 text-yellow-400" : "text-gray-300 hover:text-yellow-300"} />
            </button>
          ))}
        </div>
      );
    }

    case "date":
    case "dateTime": {
      const picker = (
        <DatePicker
          value={value}
          withTime={field.type === "dateTime"}
          onCommit={(v) => save(v)}
          onClose={onCancel}
        />
      );
      return anchorRect ? (
        <CellPopover anchorRect={anchorRect} onClose={onCancel} minWidth={260}>{picker}</CellPopover>
      ) : (
        <div className="rounded-lg border border-border-token">{picker}</div>
      );
    }

    default:
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") commitText();
          }}
          className="w-full rounded border border-accent bg-background p-1 text-sm outline-none"
        />
      );
  }
}

export { isComputed };
