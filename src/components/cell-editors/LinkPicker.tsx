"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import type { FieldDTO } from "@/lib/types";

export interface LinkChip { id: string; label: string }

/** Record picker for a link field. Fetches candidate records from the linked
 *  table, lets you search/toggle, and reports the new selection. */
export function LinkPicker({
  field,
  value,
  onChange,
  onClose,
}: {
  field: FieldDTO;
  value: LinkChip[];
  onChange: (chips: LinkChip[]) => void;
  onClose: () => void;
}) {
  const linkedTableId = field.options.linkedTableId as string;
  const allowMultiple = field.options.allowMultiple !== false;
  const [options, setOptions] = useState<LinkChip[] | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LinkChip[]>(value);

  useEffect(() => {
    let alive = true;
    fetch(`/api/tables/${linkedTableId}/link-options`)
      .then((r) => r.json())
      .then((d) => alive && setOptions(d.options ?? []));
    return () => { alive = false; };
  }, [linkedTableId]);

  const selectedIds = useMemo(() => new Set(selected.map((c) => c.id)), [selected]);
  const filtered = useMemo(
    () => (options ?? []).filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  function toggle(chip: LinkChip) {
    let next: LinkChip[];
    if (selectedIds.has(chip.id)) next = selected.filter((c) => c.id !== chip.id);
    else next = allowMultiple ? [...selected, chip] : [chip];
    setSelected(next);
    onChange(next);
    if (!allowMultiple) onClose();
  }

  return (
    <div className="text-sm">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-border-token p-2">
          {selected.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-xs">
              {c.label}
              <button onClick={() => toggle(c)} className="text-muted hover:text-red-600"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="p-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search records…"
          className="w-full rounded border border-border-token px-2 py-1 text-sm outline-none focus:border-accent"
        />
      </div>
      <div className="thin-scroll max-h-56 overflow-y-auto px-1 pb-1">
        {options === null && (
          <div className="flex justify-center py-3 text-muted"><Loader2 size={16} className="animate-spin" /></div>
        )}
        {options !== null && filtered.length === 0 && (
          <div className="px-2 py-2 text-xs text-muted">No records</div>
        )}
        {filtered.map((o) => (
          <button
            key={o.id}
            onClick={() => toggle(o)}
            className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-surface"
          >
            <span className="truncate">{o.label}</span>
            {selectedIds.has(o.id) && <Check size={15} className="text-accent" />}
          </button>
        ))}
      </div>
    </div>
  );
}
