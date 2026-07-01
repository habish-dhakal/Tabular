"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { SelectChoice } from "@/lib/fields";

function Chip({ choice, onRemove }: { choice: SelectChoice; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: choice.color + "22", color: choice.color }}
    >
      {choice.name}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-70">
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function SelectMenu({
  choices,
  value,
  multi,
  onCommit,
  onClose,
}: {
  choices: SelectChoice[];
  value: unknown;
  multi: boolean;
  onCommit: (v: unknown) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const selected: string[] = multi
    ? ((value as string[]) ?? [])
    : value != null && value !== ""
    ? [String(value)]
    : [];

  const filtered = useMemo(
    () => choices.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())),
    [choices, query]
  );

  function toggle(id: string) {
    if (multi) {
      const set = new Set(selected);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      onCommit([...set]);
    } else {
      onCommit(id);
      onClose();
    }
  }

  return (
    <div className="text-sm">
      {multi && selected.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-border-token p-2">
          {selected.map((id) => {
            const c = choices.find((x) => x.id === id);
            return c ? <Chip key={id} choice={c} onRemove={() => toggle(id)} /> : null;
          })}
        </div>
      )}
      <div className="p-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search options…"
          className="w-full rounded border border-border-token px-2 py-1 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="thin-scroll max-h-56 overflow-y-auto px-1 pb-1">
        {!multi && (
          <button
            onClick={() => { onCommit(null); onClose(); }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-muted hover:bg-surface"
          >
            <X size={14} /> Clear
          </button>
        )}
        {filtered.map((c) => {
          const isSel = selected.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-surface"
            >
              <Chip choice={c} />
              {isSel && <Check size={15} className="text-accent" />}
            </button>
          );
        })}
        {filtered.length === 0 && <div className="px-2 py-2 text-xs text-muted">No matching options</div>}
      </div>
    </div>
  );
}
