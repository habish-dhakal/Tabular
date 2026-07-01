"use client";

import { useTable } from "@/components/table/TableProvider";
import { CellDisplay } from "@/components/Cell";
import type { RecordDTO } from "@/lib/types";

/** Compact record card used in kanban / gallery / calendar. */
export function RecordCard({
  record,
  onOpen,
  hideFieldId,
  draggable,
  onDragStart,
}: {
  record: RecordDTO;
  onOpen: () => void;
  hideFieldId?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const { fields, config } = useTable();
  const hidden = new Set(config.hiddenFieldIds ?? []);
  const primary = fields.find((f) => f.isPrimary) ?? fields[0];
  const others = fields.filter(
    (f) => !f.isPrimary && f.id !== hideFieldId && !hidden.has(f.id)
  ).slice(0, 4);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onOpen}
      className="cursor-pointer rounded-lg border border-border-token bg-background p-2.5 shadow-sm transition hover:border-accent hover:shadow"
    >
      <div className="mb-1 truncate text-sm font-medium">
        {primary ? <CellDisplay field={primary} value={record.cells[primary.id]} /> : "—"}
      </div>
      <div className="space-y-1">
        {others.map((f) => {
          const v = record.cells[f.id];
          if (v === undefined || v === null || v === "") return null;
          return (
            <div key={f.id} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="shrink-0">{f.name}:</span>
              <span className="truncate text-foreground"><CellDisplay field={f} value={v} /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
