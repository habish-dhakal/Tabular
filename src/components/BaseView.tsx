"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import type { TableDTO } from "@/lib/types";
import { TableWorkspace } from "@/components/table/TableWorkspace";
import { useDialog } from "@/components/ui/DialogProvider";

export function BaseView({
  baseId,
  tables,
  initialTableId,
  initialViewId,
}: {
  baseId: string;
  tables: TableDTO[];
  initialTableId?: string;
  initialViewId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialog = useDialog();
  const requestedTableId = searchParams.get("table") ?? initialTableId;
  const requestedViewId = searchParams.get("view") ?? initialViewId;
  const [tableList, setTableList] = useState(tables);
  const [activeId, setActiveId] = useState(validTableId(tables, requestedTableId) ?? tables[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => setTableList(tables), [tables]);

  useEffect(() => {
    setActiveId((current) => validTableId(tableList, requestedTableId) ?? validTableId(tableList, current) ?? tableList[0]?.id ?? null);
  }, [requestedTableId, tableList]);

  const activeViewId = useMemo(() => (activeId === requestedTableId ? requestedViewId : undefined), [activeId, requestedTableId, requestedViewId]);

  const baseUrl = useCallback((tableId?: string | null, viewId?: string | null) => {
    const params = new URLSearchParams();
    if (tableId) params.set("table", tableId);
    if (viewId) params.set("view", viewId);
    const query = params.toString();
    return `/base/${baseId}${query ? `?${query}` : ""}`;
  }, [baseId]);

  const selectTable = useCallback((tableId: string, viewId?: string | null) => {
    setActiveId(tableId);
    router.push(baseUrl(tableId, viewId));
  }, [baseUrl, router]);

  const updateActiveView = useCallback((viewId: string | null) => {
    if (!activeId) return;
    router.replace(baseUrl(activeId, viewId));
  }, [activeId, baseUrl, router]);

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
      setTableList((prev) => [...prev, table].sort((a, b) => a.position - b.position));
      selectTable(table.id);
      router.refresh();
    }
  }

  function startRename(table: TableDTO) {
    setEditingId(table.id);
    setDraftName(table.name);
  }

  async function saveRename(event?: FormEvent) {
    event?.preventDefault();
    if (!editingId) return;
    const name = draftName.trim();
    const current = tableList.find((table) => table.id === editingId);
    if (!name || !current || name === current.name) {
      setEditingId(null);
      return;
    }
    const res = await fetch(`/api/tables/${editingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Rename failed" }));
      void dialog.alert({ title: "Rename rejected", message: error });
      return;
    }
    setTableList((prev) => prev.map((table) => (table.id === editingId ? { ...table, name } : table)));
    setEditingId(null);
    router.refresh();
  }

  async function deleteTable(table: TableDTO) {
    if (!await dialog.confirm({ title: "Delete table?", message: `"${table.name}" will be removed from this base.`, confirmLabel: "Delete", danger: true })) return;
    const next = nextTableId(tableList, table.id);
    const res = await fetch(`/api/tables/${table.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: "Delete failed" }));
      void dialog.alert({ title: "Delete rejected", message: error });
      return;
    }
    setTableList((prev) => prev.filter((item) => item.id !== table.id));
    setEditingId(null);
    if (activeId === table.id) {
      setActiveId(next);
      router.push(baseUrl(next));
    }
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Table tabs */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-token bg-surface px-2">
        {tableList.map((t) => (
          <div
            key={t.id}
            className={
              "flex items-center rounded-md text-sm font-medium transition " +
              (t.id === activeId
                ? "bg-background text-foreground shadow-sm"
                : "text-muted hover:bg-background/60")
            }
          >
            {editingId === t.id ? (
              <form onSubmit={saveRename} className="flex items-center gap-1 px-1 py-0.5">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => void saveRename()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingId(null);
                    }
                  }}
                  className="h-7 w-36 rounded border border-border-token bg-background px-2 text-sm outline-none focus:border-accent"
                />
                <button type="submit" className="rounded p-1 text-muted hover:text-accent" aria-label="Save table name"><Check size={13} /></button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditingId(null)} className="rounded p-1 text-muted hover:text-red-600" aria-label="Cancel table rename"><X size={13} /></button>
              </form>
            ) : (
              <>
                <button
                  onClick={() => (t.id === activeId ? startRename(t) : selectTable(t.id))}
                  className="max-w-48 truncate px-3 py-1"
                  title={t.name}
                >
                  {t.name}
                </button>
                {t.id === activeId && (
                  <button
                    onClick={() => void deleteTable(t)}
                    className="mr-1 rounded p-1 text-muted hover:text-red-600"
                    aria-label={`Delete ${t.name}`}
                    title="Delete table"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </>
            )}
          </div>
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
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activeId ? (
          <TableWorkspace key={activeId} tableId={activeId} initialViewId={activeViewId} onViewChange={updateActiveView} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">
            No tables yet. Create one to get started.
          </div>
        )}
      </div>
    </div>
  );
}

function validTableId(tables: TableDTO[], tableId?: string | null) {
  return tableId && tables.some((table) => table.id === tableId) ? tableId : null;
}

function nextTableId(tables: TableDTO[], deletedId: string) {
  const index = tables.findIndex((table) => table.id === deletedId);
  return tables[index + 1]?.id ?? tables[index - 1]?.id ?? null;
}
