"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Star } from "lucide-react";
import type { FieldDTO } from "@/lib/types";
import type { SelectChoice } from "@/lib/fields";
import { isComputed } from "@/lib/fields";

function choicesOf(field: FieldDTO): SelectChoice[] {
  return (field.options.choices as SelectChoice[]) ?? [];
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

/** Read-only rendering of a cell value. */
export function CellDisplay({ field, value }: { field: FieldDTO; value: unknown }) {
  if (value === undefined || value === null || value === "") {
    return <span className="text-transparent">·</span>;
  }

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
            <Star
              key={i}
              size={14}
              className={i < n ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}
            />
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
      return <span>{new Date(value as string).toLocaleDateString()}</span>;
    case "dateTime":
      return <span>{new Date(value as string).toLocaleString()}</span>;

    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-accent underline">
          {String(value)}
        </a>
      );

    default:
      return <span className="truncate">{String(value)}</span>;
  }
}

/** Editable cell editor. Calls onCommit(newValue) or onCancel(). */
export function CellEditor({
  field,
  value,
  onCommit,
  onCancel,
}: {
  field: FieldDTO;
  value: unknown;
  onCommit: (v: unknown) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string>(
    value === undefined || value === null ? "" : String(value)
  );

  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
  }, []);

  const commitText = () => onCommit(draft === "" ? null : draft);

  switch (field.type) {
    case "longText":
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitText();
          }}
          className="h-24 w-full resize-none rounded border border-accent bg-background p-1 text-sm outline-none"
        />
      );

    case "singleSelect": {
      const cs = choicesOf(field);
      return (
        <select
          autoFocus
          value={(value as string) ?? ""}
          onChange={(e) => onCommit(e.target.value || null)}
          onBlur={onCancel}
          className="w-full rounded border border-accent bg-background p-1 text-sm outline-none"
        >
          <option value="">—</option>
          {cs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      );
    }

    case "number":
    case "currency":
    case "percent":
    case "rating":
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

    case "date":
    case "dateTime":
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={field.type === "date" ? "date" : "datetime-local"}
          value={draft ? new Date(draft).toISOString().slice(0, field.type === "date" ? 10 : 16) : ""}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onCommit(draft || null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter") onCommit(draft || null);
          }}
          className="w-full rounded border border-accent bg-background p-1 text-sm outline-none"
        />
      );

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
