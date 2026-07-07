"use client";

import { Plus } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import { useAutomations } from "@/components/automations/AutomationsProvider";
import { cn } from "@/lib/utils";
import type { TriggerType } from "@/lib/types";

const TRIGGER_SHORT: Record<TriggerType, string> = {
  recordCreated: "Record created",
  recordUpdated: "Record updated",
  recordMatchesCondition: "Matches condition",
  recordEntersCondition: "Enters condition",
  recordDeleted: "Record deleted",
  scheduled: "Scheduled",
};

export function AutomationList({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const { automations, selectedId, toggle, create } = useAutomations();

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-1 overflow-auto p-2">
        {automations.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted">No automations yet.</p>
        )}
        {automations.map((a) => (
          <div
            key={a.id}
            data-testid="automation-row"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(a.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(a.id); } }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
              a.id === selectedId
                ? "bg-accent-soft ring-1 ring-accent/20"
                : "hover:bg-surface"
            )}
          >
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-sm font-medium", a.id === selectedId && "text-accent-hover")}>{a.name}</div>
              <div className="truncate text-xs text-muted">{TRIGGER_SHORT[a.triggerType]}</div>
            </div>
            <Toggle
              checked={a.enabled}
              onChange={(next) => toggle(a.id, next)}
              label={`Enable ${a.name}`}
              data-testid="automation-toggle"
            />
          </div>
        ))}
      </div>
      <div className="border-t border-border-token p-2">
        <button
          data-testid="automation-new"
          onClick={() => create()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover"
        >
          <Plus size={15} /> New automation
        </button>
      </div>
    </div>
  );
}
