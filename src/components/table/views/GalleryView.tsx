"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { RecordCard } from "@/components/table/RecordCard";
import { RecordModal } from "@/components/table/RecordModal";
import { applyFilterSort } from "@/lib/query";
import type { RecordDTO } from "@/lib/types";

export function GalleryView() {
  const { fields, records, config, addRecord } = useTable();
  const [open, setOpen] = useState<RecordDTO | null>(null);
  const rows = useMemo(() => applyFilterSort(records, fields, config), [records, fields, config]);

  return (
    <div className="thin-scroll h-full overflow-auto bg-surface p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {rows.map((r) => (
          <RecordCard key={r.id} record={r} onOpen={() => setOpen(r)} />
        ))}
        <button
          onClick={() => addRecord()}
          className="flex min-h-[80px] items-center justify-center gap-1 rounded-lg border border-dashed border-border-token text-sm text-muted hover:border-accent hover:text-accent"
        >
          <Plus size={16} /> Add record
        </button>
      </div>
      {open && <RecordModal record={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
