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
    <div className="rounded-lg border border-border-token bg-surface" data-testid={isLoop ? "loop-step" : "conditional-step"}>
      <div className="flex items-center gap-2 border-b border-border-token px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">{index + 1}</span>
        <Icon size={15} className="text-accent" />
        <span className="flex-1 text-sm font-medium">{isLoop ? "Repeating group" : "Conditional group"}</span>
        <button disabled={index === 0} onClick={() => onMove(-1)} className="text-muted hover:text-foreground disabled:opacity-30"><ChevronUp size={15} /></button>
        <button disabled={index === count - 1} onClick={() => onMove(1)} className="text-muted hover:text-foreground disabled:opacity-30"><ChevronDown size={15} /></button>
        <button data-testid="group-remove" onClick={onRemove} className="text-muted hover:text-red-600"><Trash2 size={15} /></button>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <p className="mb-1 text-xs font-medium text-muted">
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
        </div>

        {isLoop && (
          <p className="rounded bg-background px-2 py-1 text-xs text-muted">
            Inside the loop, reference the current record with <code className="text-foreground">{"{{item.Field name}}"}</code>.
          </p>
        )}

        <div className="border-t border-border-token pt-3">
          <p className="mb-2 text-xs font-medium text-muted">{isLoop ? "Steps to repeat" : "Steps to run"}</p>
          <ActionList
            nodes={node.children}
            depth={depth + 1}
            onChange={(children) => onChange({ ...node, children })}
          />
        </div>
      </div>
    </div>
  );
}
