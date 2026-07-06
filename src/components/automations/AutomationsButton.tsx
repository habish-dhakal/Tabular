"use client";

import { Zap } from "lucide-react";
import { useAutomations } from "@/components/automations/AutomationsProvider";

export function AutomationsButton() {
  const { setOpen, automations } = useAutomations();
  const enabledCount = automations.filter((a) => a.enabled).length;

  return (
    <button
      data-testid="automations-open"
      onClick={() => setOpen(true)}
      className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-muted transition hover:bg-background/60"
    >
      <Zap size={14} className="text-accent" />
      Automations
      {enabledCount > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-white">
          {enabledCount}
        </span>
      )}
    </button>
  );
}
