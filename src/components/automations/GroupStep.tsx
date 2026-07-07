"use client";

import { ChevronDown, ChevronUp, Repeat, GitBranch, Trash2 } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { ConditionBuilder, type ConditionValue } from "@/components/automations/ConditionBuilder";
import { ActionList } from "@/components/automations/ActionList";
import type { ActionNode } from "@/lib/types";

/** A loop ("repeating group") or conditional group node with nested child steps. */
export function GroupStep({
  index,
  count,
  node,
  depth,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  count: number;
  node: ActionNode;
  depth: number;
  onChange: (next: ActionNode) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { fields, table } = useTable();
  const isLoop = node.kind === "loop";
  const Icon = isLoop ? Repeat : GitBranch;

  // Loop stores its filter under config.source; conditional stores it on config.
  const source = (node.config.source ?? {}) as Record<string, unknown>;
  const condValue: ConditionValue = isLoop
    ? {
        conjunction: (source.conjunction as "and" | "or") ?? "and",
        conditions: (source.conditions as ConditionValue["conditions"]) ?? [],
      }
    : {
        conjunction: (node.config.conjunction as "and" | "or") ?? "and",
        conditions: (node.config.conditions as ConditionValue["conditions"]) ?? [],
      };

  const setConditions = (v: ConditionValue) => {
    if (isLoop) {
      onChange({
        ...node,
        config: { source: { kind: "query", tableId: table?.id ?? "", conjunction: v.conjunction, conditions: v.conditions } },
      });
    } else {
      onChange({ ...node, config: { conjunction: v.conjunction, conditions: v.conditions } });
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-accent/25 bg-accent-soft/40 shadow-xs" data-testid={isLoop ? "loop-step" : "conditional-step"}>
      <div className="flex items-center gap-2 border-b border-accent/20 bg-accent-soft/70 px-3 py-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent text-xs font-semibold text-accent-contrast">{index + 1}</span>
        <Icon size={15} className="shrink-0 text-accent" />
        <span className="flex-1 text-sm font-semibold tracking-tight text-accent-hover">{isLoop ? "Repeating group" : "Conditional group"}</span>
        <div className="flex items-center gap-0.5">
          <button disabled={index === 0} onClick={() => onMove(-1)} className="rounded-md p-1 text-muted transition hover:bg-background hover:text-foreground disabled:opacity-30"><ChevronUp size={15} /></button>
          <button disabled={index === count - 1} onClick={() => onMove(1)} className="rounded-md p-1 text-muted transition hover:bg-background hover:text-foreground disabled:opacity-30"><ChevronDown size={15} /></button>
          <button data-testid="group-remove" onClick={onRemove} className="rounded-md p-1 text-muted transition hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="space-y-3 p-3">
        <div className="rounded-lg border border-border-token bg-background p-3">
          <p className="mb-1.5 text-xs font-medium text-muted">
            {isLoop
              ? `For each record in "${table?.name ?? "this table"}" matching:`
              : "Only run the steps below when:"}
          </p>
          <ConditionBuilder
            value={condValue}
            fields={fields}
            onChange={setConditions}
            emptyLabel={isLoop ? "All records (no filter)." : "Always (no condition)."}
          />
          {isLoop && (
            <p className="mt-2 border-t border-border-token pt-2 text-xs text-muted">
              Inside the loop, reference the current record with <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-foreground">{"{{item.Field}}"}</code>.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{isLoop ? "Steps to repeat" : "Steps to run"}</p>
          <div className="border-l-2 border-accent/20 pl-3">
            <ActionList
              nodes={node.children}
              depth={depth + 1}
              onChange={(children) => onChange({ ...node, children })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
