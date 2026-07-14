"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { CellDisplay } from "@/components/Cell";
import { RecordModal } from "@/components/table/RecordModal";
import { useTable } from "@/components/table/TableProvider";
import { computeCellValue } from "@/lib/compute";
import { visibleFieldsForView } from "@/lib/view-query";
import type { RecordDTO } from "@/lib/types";

export function ListView() {
  const {
    fields,
    records,
    config,
    addRecord,
    hasMoreRecords,
    loadMoreRecords,
    recordLoading,
    recordTotal,
    viewQueryWarning,
  } = useTable();
  const [open, setOpen] = useState<RecordDTO | null>(null);
  const visibleFields = useMemo(() => visibleFieldsForView(fields, config), [fields, config]);
  const primary = visibleFields.find((field) => field.isPrimary) ?? visibleFields[0];
  const secondary = visibleFields.filter((field) => field.id !== primary?.id).slice(0, 4);

  return (
    <div className="thin-scroll h-full overflow-auto bg-background">
      {viewQueryWarning && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {viewQueryWarning}
        </div>
      )}
      <div className="divide-y divide-border-token">
        {records.map((record, index) => (
          <button
            key={record.id}
            onClick={() => setOpen(record)}
            className="grid w-full grid-cols-[56px_minmax(220px,1.5fr)_repeat(4,minmax(120px,1fr))] items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
          >
            <span className="text-xs text-muted">{index + 1}</span>
            <span className="min-w-0 font-medium">
              {primary ? <CellDisplay field={primary} value={computeCellValue(primary, record, fields)} /> : "Record"}
            </span>
            {secondary.map((field) => (
              <span key={field.id} className="min-w-0 text-muted">
                <CellDisplay field={field} value={computeCellValue(field, record, fields)} />
              </span>
            ))}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border-token px-3 py-2">
        <button onClick={() => addRecord()} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted hover:bg-surface">
          <Plus size={14} />
          Add record
        </button>
        {hasMoreRecords ? (
          <button
            onClick={() => loadMoreRecords()}
            disabled={recordLoading}
            className="rounded-md border border-border-token px-2.5 py-1 text-sm hover:bg-surface disabled:opacity-50"
          >
            {recordLoading ? "Loading..." : "Load more"}
          </button>
        ) : (
          <span className="text-xs text-muted">{recordTotal == null ? records.length : recordTotal} rows</span>
        )}
      </div>
      {open && <RecordModal record={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
