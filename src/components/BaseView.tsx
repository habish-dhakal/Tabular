"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { TableDTO } from "@/lib/types";
import { TableWorkspace } from "@/components/table/TableWorkspace";
import { useDialog } from "@/components/ui/DialogProvider";

export function BaseView({ baseId, tables }: { baseId: string; tables: TableDTO[] }) {
  const router = useRouter();
  const dialog = useDialog();
  const [activeId, setActiveId] = useState(tables[0]?.id ?? null);
  const [creating, setCreating] = useState(false);

  async function addTable() {
    const name = await dialog.prompt({ title: "New table", label: "Name", placeholder: "Untitled", defaultValue: "Untitled", confirmLabel: "Create" });
    if (!name?.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/bases/${baseId}/tables`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setCreating(false);
    if (res.ok) {
      const { table } = await res.json();
      setActiveId(table.id);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Table tabs */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-token bg-surface px-2">
        {tables.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={
              "rounded-md px-3 py-1 text-sm font-medium transition " +
              (t.id === activeId
                ? "bg-background text-foreground shadow-sm"
                : "text-muted hover:bg-background/60")
            }
          >
            {t.name}
          </button>
        ))}
        <button
          onClick={addTable}
          disabled={creating}
          className="ml-1 flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-background/60"
          title="Add table"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-hidden">
        {activeId ? (
          <TableWorkspace key={activeId} tableId={activeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            No tables yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}
