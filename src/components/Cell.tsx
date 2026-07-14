"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ExternalLink, Paperclip, Star, UserCircle } from "lucide-react";
import type { FieldDTO } from "@/lib/types";
import type { AttachmentMetadata } from "@/lib/attachments";
import type { SelectChoice } from "@/lib/fields";
import { isComputed } from "@/lib/fields";
import { CellPopover } from "@/components/cell-editors/CellPopover";
import { DatePicker } from "@/components/cell-editors/DatePicker";
import { SelectMenu } from "@/components/cell-editors/SelectMenu";

function choicesOf(field: FieldDTO): SelectChoice[] {
  return (field.options.choices as SelectChoice[]) ?? [];
}

// Pill used for linked-record chips + lookup values. Rounded, bordered, shows
// the full label; only genuinely long names ellipsize (max-w + truncate).
const CHIP_CLS =
  "inline-flex max-w-[180px] shrink-0 items-center truncate rounded-full border border-border-token bg-surface px-2 py-[3px] text-xs font-medium text-foreground/80";

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

function fmtDuration(seconds: unknown): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
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
    case "duration":
      return <span>{fmtDuration(value)}</span>;

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
        <span className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c.id} className={CHIP_CLS}>
              {c.label}
            </span>
          ))}
        </span>
      );
    }

    case "user": {
      const ids = Array.isArray(value) ? value.map(String) : [String(value)];
      return (
        <span className="flex flex-wrap gap-1.5">
          {ids.filter(Boolean).map((id) => (
            <span key={id} className={CHIP_CLS}>
              <UserCircle size={12} className="mr-1" /> {id}
            </span>
          ))}
        </span>
      );
    }

    case "attachment": {
      const items = Array.isArray(value) ? (value as AttachmentMetadata[]) : [];
      if (items.length === 0) return <span className="text-transparent">·</span>;
      return (
        <span className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item.id} className={CHIP_CLS} title={`${item.name} · ${formatBytes(item.size)}`}>
              <Paperclip size={12} className="mr-1" /> {item.name}
            </span>
          ))}
        </span>
      );
    }

    case "lookup": {
      const vals = Array.isArray(value) ? value : [value];
      if (vals.length === 0) return <span className="text-transparent">·</span>;
      return (
        <span className="flex flex-wrap gap-1.5">
          {vals.map((v, i) => (
            <span key={i} className={CHIP_CLS}>
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

    case "button": {
      const label = String(field.options.label ?? value ?? "Open");
      const url = String(field.options.url ?? "").trim();
      const inner = (
        <span className="inline-flex items-center gap-1 rounded-md border border-border-token bg-surface px-2 py-1 text-xs font-medium">
          {label} {url && <ExternalLink size={12} />}
        </span>
      );
      return expanded && url ? <a href={url} target="_blank" rel="noreferrer">{inner}</a> : inner;
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

interface MemberOption {
  id: string;
  name: string | null;
  email: string;
}

function UserPicker({
  field,
  value,
  onCommit,
}: {
  field: FieldDTO;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const allowMultiple = field.options.allowMultiple === true;
  const selected = new Set((Array.isArray(value) ? value : value ? [value] : []).map(String));

  useEffect(() => {
    let alive = true;
    fetch(`/api/tables/${field.tableId}/members`)
      .then((res) => res.json())
      .then((items) => alive && setMembers(Array.isArray(items) ? items : []))
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [field.tableId]);

  return (
    <div className="max-h-64 min-w-56 space-y-1 overflow-y-auto p-2">
      {members.map((member) => {
        const on = selected.has(member.id);
        return (
          <button
            key={member.id}
            type="button"
            onClick={() => {
              if (!allowMultiple) {
                onCommit(on ? null : member.id);
                return;
              }
              const next = new Set(selected);
              if (on) next.delete(member.id);
              else next.add(member.id);
              onCommit([...next]);
            }}
            className={"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface " + (on ? "bg-surface" : "")}
          >
            <UserCircle size={16} className="text-muted" />
            <span className="min-w-0">
              <span className="block truncate">{member.name || member.email}</span>
              {member.name && <span className="block truncate text-xs text-muted">{member.email}</span>}
            </span>
          </button>
        );
      })}
      {members.length === 0 && <p className="px-2 py-1 text-xs text-muted">No workspace members.</p>}
    </div>
  );
}

function AttachmentEditor({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const [items, setItems] = useState<AttachmentMetadata[]>(Array.isArray(value) ? value as AttachmentMetadata[] : []);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState("application/octet-stream");
  const [size, setSize] = useState("0");

  const commit = (next: AttachmentMetadata[]) => {
    setItems(next);
    onCommit(next.length ? next : null);
  };

  return (
    <div className="w-80 space-y-2 p-2">
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border border-border-token px-2 py-1 text-xs">
            <span className="min-w-0 truncate">{item.name}</span>
            <button type="button" onClick={() => commit(items.filter((next) => next.id !== item.id))} className="text-muted hover:text-red-600">
              Remove
            </button>
          </div>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="File name" className="w-full rounded border border-border-token px-2 py-1 text-sm outline-none focus:border-accent" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL or storage key" className="w-full rounded border border-border-token px-2 py-1 text-sm outline-none focus:border-accent" />
      <div className="grid grid-cols-2 gap-2">
        <input value={type} onChange={(e) => setType(e.target.value)} placeholder="MIME type" className="rounded border border-border-token px-2 py-1 text-sm outline-none focus:border-accent" />
        <input value={size} onChange={(e) => setSize(e.target.value)} type="number" min={0} placeholder="Bytes" className="rounded border border-border-token px-2 py-1 text-sm outline-none focus:border-accent" />
      </div>
      <button
        type="button"
        onClick={() => {
          const trimmed = name.trim();
          if (!trimmed) return;
          const next = [
            ...items,
            {
              id: url.trim() || trimmed,
              name: trimmed,
              url: url.trim() || undefined,
              type: type.trim() || "application/octet-stream",
              size: Number(size) || 0,
              scanStatus: "pending" as const,
            },
          ];
          commit(next);
          setName("");
          setUrl("");
          setSize("0");
        }}
        className="rounded-md bg-accent px-2 py-1 text-sm font-medium text-accent-contrast"
      >
        Add attachment metadata
      </button>
    </div>
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

  const inlineTypes = new Set(["singleLineText", "url", "email", "phone", "number", "currency", "percent", "duration"]);
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

    case "duration":
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={draft}
          placeholder="Seconds or h:mm:ss"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") commitText();
          }}
          className="w-full rounded border border-accent bg-background p-1 text-sm outline-none"
        />
      );

    case "user": {
      const picker = <UserPicker field={field} value={value} onCommit={(v) => save(v)} />;
      return anchorRect ? (
        <CellPopover anchorRect={anchorRect} onClose={onCancel} minWidth={240}>{picker}</CellPopover>
      ) : (
        <div className="rounded-lg border border-border-token">{picker}</div>
      );
    }

    case "attachment": {
      const editor = <AttachmentEditor value={value} onCommit={(v) => save(v)} />;
      return anchorRect ? (
        <CellPopover anchorRect={anchorRect} onClose={onCancel} minWidth={320}>{editor}</CellPopover>
      ) : (
        <div className="rounded-lg border border-border-token">{editor}</div>
      );
    }

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
