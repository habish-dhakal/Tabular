"use client";

import { useState } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { useAutomations } from "@/components/automations/AutomationsProvider";
import { AutomationList } from "@/components/automations/AutomationList";
import { AutomationBuilder } from "@/components/automations/AutomationBuilder";
import { RunHistory } from "@/components/automations/RunHistory";
import { useDialog } from "@/components/ui/DialogProvider";

export function AutomationsPanel() {
  const { open, setOpen, automations, selectedId, select, remove, loading } = useAutomations();
  const dialog = useDialog();
  const [tab, setTab] = useState<"build" | "runs">("build");
  const [dirty, setDirty] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  if (!open) return null;

  const selected = automations.find((a) => a.id === selectedId) ?? null;

  async function guarded(action: () => void | Promise<void>) {
    if (dirty && !(await dialog.confirm({
      title: "Discard changes?",
      message: "You have unsaved changes to this automation. They'll be lost.",
      confirmLabel: "Discard",
      danger: true,
    }))) return;
    setDirty(false);
    await action();
  }
  const close = () => guarded(() => setOpen(false));
  const selectAutomation = (id: string) => guarded(() => { select(id); setTab("build"); });

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm" onClick={close}>
      <div
        data-testid="automations-panel"
        className="anim-modal flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-token bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-token px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-tight">Automations</h3>
          <button onClick={close} className="rounded-lg p-1 text-muted transition hover:bg-surface hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left rail */}
          <div className="w-64 shrink-0 border-r border-border-token">
            <AutomationList onSelect={selectAutomation} />
          </div>

          {/* Right pane */}
          <div className="flex min-w-0 flex-1 flex-col">
            {loading ? (
              <div className="flex flex-1 items-center justify-center text-muted"><Loader2 className="animate-spin" size={20} /></div>
            ) : !selected ? (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
                Select an automation, or create one to get started.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1 border-b border-border-token px-3">
                  {(["build", "runs"] as const).map((t) => (
                    <button
                      key={t}
                      data-testid={t === "runs" ? "runs-tab" : undefined}
                      onClick={() => setTab(t)}
                      className={
                        "border-b-2 px-3 py-2 text-sm transition " +
                        (tab === t ? "border-accent font-medium text-foreground" : "border-transparent text-muted hover:text-foreground")
                      }
                    >
                      {t === "build" ? "Build" : "Runs"}
                    </button>
                  ))}
                  <button
                    onClick={() => guarded(async () => {
                      if (await dialog.confirm({
                        title: "Delete automation?",
                        message: `"${selected.name}" and its run history will be permanently removed.`,
                        confirmLabel: "Delete",
                        danger: true,
                      })) remove(selected.id);
                    })}
                    className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:text-red-600"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  {tab === "build" ? (
                    <AutomationBuilder
                      automation={selected}
                      onDirtyChange={setDirty}
                      onRan={() => { setRefreshKey((k) => k + 1); setTab("runs"); }}
                    />
                  ) : (
                    <RunHistory automationId={selected.id} refreshKey={refreshKey} />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
