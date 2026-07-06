"use client";

import { nanoid } from "nanoid";
import { Plus } from "lucide-react";
import { ActionStep } from "@/components/automations/ActionStep";
import type { AutomationAction } from "@/lib/types";

export function newAction(): AutomationAction {
  return { id: nanoid(8), type: "sendEmail", position: 0, config: {} };
}

export function ActionList({
  actions,
  onChange,
}: {
  actions: AutomationAction[];
  onChange: (next: AutomationAction[]) => void;
}) {
  const update = (i: number, next: AutomationAction) =>
    onChange(actions.map((a, j) => (j === i ? next : a)));
  const remove = (i: number) => onChange(actions.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= actions.length) return;
    const next = [...actions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {actions.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-token px-3 py-6 text-center text-sm text-muted">
          No actions yet. Add one below.
        </p>
      )}
      {actions.map((a, i) => (
        <ActionStep
          key={a.id}
          index={i}
          count={actions.length}
          action={a}
          onChange={(next) => update(i, next)}
          onRemove={() => remove(i)}
          onMove={(dir) => move(i, dir)}
        />
      ))}
      <button
        data-testid="action-add"
        onClick={() => onChange([...actions, newAction()])}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-token py-2 text-sm text-accent hover:bg-surface"
      >
        <Plus size={15} /> Add action
      </button>
    </div>
  );
}
