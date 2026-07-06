"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { useTable } from "@/components/table/TableProvider";
import { isComputed } from "@/lib/fields";

const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Text input/textarea whose value can reference trigger fields as
 * `{{Field Name}}` tokens. The "+ Insert field" popover injects a token at the
 * caret; a chip row below previews the tokens currently in the value.
 */
export function TokenInput({
  value,
  onChange,
  multiline,
  placeholder,
  "data-testid": testId = "token-input",
}: {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  "data-testid"?: string;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // Track caret so an insert lands where the user last was, even after blur.
  const [caret, setCaret] = useState<number | null>(null);

  function insert(fieldName: string) {
    const token = `{{${fieldName}}}`;
    const el = ref.current;
    const pos = caret ?? el?.selectionStart ?? value.length;
    const next = value.slice(0, pos) + token + value.slice(pos);
    onChange(next);
    setCaret(pos + token.length);
    // Restore focus + caret after the value updates.
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(pos + token.length, pos + token.length);
      }
    });
  }

  const tokens = [...value.matchAll(TOKEN_RE)].map((m) => m[1].trim());
  const base =
    "w-full rounded-md border border-border-token bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-1.5">
        {multiline ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            data-testid={testId}
            value={value}
            placeholder={placeholder}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
            className={base + " resize-y"}
          />
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            data-testid={testId}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart)}
            className={base}
          />
        )}
        <FieldPicker onPick={insert} />
      </div>
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tokens.map((t, i) => (
            <span key={i} className="rounded bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldPicker({ onPick }: { onPick: (name: string) => void }) {
  const { fields } = useTable();
  const [q, setQ] = useState("");
  // Only stored fields resolve in tokens; computed values aren't available.
  const usable = fields.filter((f) => !isComputed(f.type));
  const filtered = usable.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Popover
      width={220}
      align="right"
      trigger={() => (
        <span
          data-testid="token-insert"
          className="mt-0.5 flex shrink-0 items-center gap-1 rounded-md border border-border-token px-1.5 py-1 text-xs text-muted hover:bg-surface"
          title="Insert field token"
        >
          <Plus size={12} /> Field
        </span>
      )}
    >
      {(close) => (
        <div className="space-y-1">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search fields…"
            className="w-full rounded border border-border-token px-1.5 py-1 text-sm outline-none focus:border-accent"
          />
          <div className="max-h-56 space-y-0.5 overflow-auto">
            {filtered.length === 0 && <p className="px-1 py-1 text-xs text-muted">No fields.</p>}
            {filtered.map((f) => (
              <button
                key={f.id}
                onClick={() => { onPick(f.name); setQ(""); close(); }}
                className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-surface"
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
