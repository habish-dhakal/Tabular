"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { CellDisplay, CellEditor } from "@/components/Cell";
import { FIELD_TYPE_META, isComputed } from "@/lib/fields";
import type { RecordDTO } from "@/lib/types";

export function RecordModal({ record, onClose }: { record: RecordDTO; onClose: () => void }) {
  const { fields, commitCell, records } = useTable();
  const [editingField, setEditingField] = useState<string | null>(null);

  // Always read the freshest copy from context.
  const live = records.find((r) => r.id === record.id) ?? record;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-20" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border-token bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-token px-4 py-3">
          <h3 className="font-medium">Record</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-auto p-4">
          {fields.map((f) => {
            const value = live.cells[f.id];
            const computed = isComputed(f.type);
            const editing = editingField === f.id;
            return (
              <div key={f.id} className="grid grid-cols-[130px_1fr] items-start gap-3">
                <div className="pt-1 text-xs font-medium text-muted" title={FIELD_TYPE_META[f.type].label}>
                  {f.name}
                </div>
                {f.type === "checkbox" ? (
                  <input type="checkbox" checked={!!value} onChange={(e) => commitCell(live.id, f.id, e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                ) : editing ? (
                  <CellEditor field={f} value={value} onCommit={(v) => { commitCell(live.id, f.id, v); setEditingField(null); }} onCancel={() => setEditingField(null)} />
                ) : (
                  <div
                    onClick={() => !computed && setEditingField(f.id)}
                    className={"min-h-[28px] rounded border border-transparent px-1.5 py-1 text-sm " + (computed ? "text-muted" : "cursor-text hover:border-border-token")}
                  >
                    <CellDisplay field={f} value={value} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
