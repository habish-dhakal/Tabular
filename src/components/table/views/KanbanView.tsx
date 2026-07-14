"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { RecordCard } from "@/components/table/RecordCard";
import { RecordModal } from "@/components/table/RecordModal";
import type { SelectChoice } from "@/lib/fields";
import type { RecordDTO } from "@/lib/types";

const UNCAT = "__uncat__";

export function KanbanView() {
  const { fields, records, config, updateConfig, commitCell, addRecord } = useTable();
  const [open, setOpen] = useState<RecordDTO | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const selectFields = fields.filter((f) => f.type === "singleSelect");
  const stackFieldId = config.stackFieldId ?? selectFields[0]?.id ?? null;
  const stackField = fields.find((f) => f.id === stackFieldId);

  const rows = records;

  const columns = useMemo(() => {
    if (!stackField) return [];
    const choices = (stackField.options.choices as SelectChoice[]) ?? [];
    const cols = choices.map((c) => ({
      key: c.id,
      label: c.name,
      color: c.color,
      records: rows.filter((r) => r.cells[stackField.id] === c.id),
    }));
    cols.push({
      key: UNCAT,
      label: "Uncategorized",
      color: "#9ca3af",
      records: rows.filter((r) => {
        const v = r.cells[stackField.id];
        return v === undefined || v === null || v === "";
      }),
    });
    return cols;
  }, [stackField, rows]);

  if (!stackField) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <p>Kanban needs a single-select field to stack by.</p>
        {selectFields.length > 0 && (
          <select
            className="rounded-lg border border-border-token px-2 py-1 text-sm"
            onChange={(e) => updateConfig({ stackFieldId: e.target.value })}
            defaultValue=""
          >
            <option value="" disabled>Choose a field…</option>
            {selectFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
      </div>
    );
  }

  async function drop(colKey: string) {
    if (!dragId) return;
    const value = colKey === UNCAT ? null : colKey;
    await commitCell(dragId, stackField!.id, value);
    setDragId(null);
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border-token px-3 py-2 text-sm text-muted">
        Stack by
        <select
          value={stackField.id}
          onChange={(e) => updateConfig({ stackFieldId: e.target.value })}
          className="rounded border border-border-token px-1.5 py-0.5 text-sm"
        >
          {selectFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div className="thin-scroll flex h-[calc(100%-41px)] gap-3 overflow-x-auto p-3">
        {columns.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => drop(col.key)}
            className="flex w-72 shrink-0 flex-col rounded-xl bg-surface"
          >
            <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} />
              {col.label}
              <span className="text-xs text-muted">{col.records.length}</span>
            </div>
            <div className="thin-scroll flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {col.records.map((r) => (
                <RecordCard
                  key={r.id}
                  record={r}
                  hideFieldId={stackField.id}
                  draggable
                  onDragStart={() => setDragId(r.id)}
                  onOpen={() => setOpen(r)}
                />
              ))}
              <button
                onClick={() => addRecord(col.key === UNCAT ? {} : { [stackField.id]: col.key })}
                className="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-background"
              >
                <Plus size={14} /> Add card
              </button>
            </div>
          </div>
        ))}
      </div>
      {open && <RecordModal record={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
