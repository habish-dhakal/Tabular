"use client";

import { Loader2, Table2, Kanban, CalendarDays, LayoutGrid, FileText, Plus, Trash2, List } from "lucide-react";
import { TableProvider, useTable } from "@/components/table/TableProvider";
import { Toolbar } from "@/components/table/Toolbar";
import { Popover } from "@/components/ui/Popover";
import { useDialog } from "@/components/ui/DialogProvider";
import { AutomationsProvider } from "@/components/automations/AutomationsProvider";
import { AutomationsButton } from "@/components/automations/AutomationsButton";
import { AutomationsPanel } from "@/components/automations/AutomationsPanel";
import { GridView } from "@/components/table/views/GridView";
import { ListView } from "@/components/table/views/ListView";
import { KanbanView } from "@/components/table/views/KanbanView";
import { CalendarView } from "@/components/table/views/CalendarView";
import { GalleryView } from "@/components/table/views/GalleryView";
import { FormView } from "@/components/table/views/FormView";
import type { ViewType } from "@/server/db/schema";

const VIEW_META: Record<ViewType, { icon: typeof Table2; label: string }> = {
  grid: { icon: Table2, label: "Grid" },
  list: { icon: List, label: "List" },
  kanban: { icon: Kanban, label: "Kanban" },
  calendar: { icon: CalendarDays, label: "Calendar" },
  gallery: { icon: LayoutGrid, label: "Gallery" },
  form: { icon: FileText, label: "Form" },
};

function ViewBar() {
  const { views, activeView, setActiveViewId, createView, deleteView } = useTable();
  const dialog = useDialog();

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-token bg-surface px-2">
      {views.map((v) => {
        const Icon = VIEW_META[v.type].icon;
        const active = v.id === activeView?.id;
        return (
          <button
            key={v.id}
            onClick={() => setActiveViewId(v.id)}
            className={
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition " +
              (active ? "bg-background font-medium shadow-sm" : "text-muted hover:bg-background/60")
            }
          >
            <Icon size={14} className="text-accent" />
            {v.name}
            {active && views.length > 1 && (
              <span
                role="button"
                onClick={async (e) => { e.stopPropagation(); if (await dialog.confirm({ title: "Delete view?", message: `"${v.name}" will be removed.`, confirmLabel: "Delete", danger: true })) deleteView(v.id); }}
                className="ml-1 text-muted hover:text-red-600"
              >
                <Trash2 size={12} />
              </span>
            )}
          </button>
        );
      })}
      <Popover
        width={180}
        trigger={() => (
          <span className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-background/60">
            <Plus size={14} /> Add view
          </span>
        )}
      >
        {(close) => (
          <div className="space-y-0.5">
            {(Object.keys(VIEW_META) as ViewType[]).map((t) => {
              const Icon = VIEW_META[t].icon;
              return (
                <button
                  key={t}
                  onClick={() => { createView(`${VIEW_META[t].label} view`, t); close(); }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface"
                >
                  <Icon size={15} className="text-accent" /> {VIEW_META[t].label}
                </button>
              );
            })}
          </div>
        )}
      </Popover>
      <AutomationsButton />
    </div>
  );
}

function ActiveView() {
  const { loading, activeView } = useTable();
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  if (!activeView) return <div className="flex h-full items-center justify-center text-muted">No view.</div>;
  switch (activeView.type) {
    case "list": return <ListView />;
    case "kanban": return <KanbanView />;
    case "calendar": return <CalendarView />;
    case "gallery": return <GalleryView />;
    case "form": return <FormView />;
    default: return <GridView />;
  }
}

function Inner() {
  const { loading, activeView } = useTable();
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {!loading && (
        <>
          <ViewBar />
          {activeView && activeView.type !== "form" && <Toolbar type={activeView.type} />}
        </>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <ActiveView />
      </div>
      <AutomationsPanel />
    </div>
  );
}

export function TableWorkspace({
  tableId,
  initialViewId,
  onViewChange,
}: {
  tableId: string;
  initialViewId?: string;
  onViewChange?: (viewId: string | null) => void;
}) {
  return (
    <TableProvider tableId={tableId} initialViewId={initialViewId} onViewChange={onViewChange}>
      <AutomationsProvider tableId={tableId}>
        <Inner />
      </AutomationsProvider>
    </TableProvider>
  );
}
