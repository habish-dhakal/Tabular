"use client";

import { nanoid } from "nanoid";
import { Plus, Repeat, GitBranch } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { ActionStep } from "@/components/automations/ActionStep";
import { GroupStep } from "@/components/automations/GroupStep";
import { MAX_GROUP_DEPTH } from "@/components/automations/tree";
import type { ActionNode } from "@/lib/types";

export function newAction(): ActionNode {
  return { id: nanoid(8), kind: "action", type: "sendEmail", config: {}, children: [] };
}
function newLoop(tableId: string): ActionNode {
  return {
    id: nanoid(8),
    kind: "loop",
    type: null,
    config: { source: { kind: "query", tableId, conjunction: "and", conditions: [] } },
    children: [],
  };
}
function newConditional(): ActionNode {
  return { id: nanoid(8), kind: "conditional", type: null, config: { conjunction: "and", conditions: [] }, children: [] };
}

export function ActionList({
  nodes,
  onChange,
  depth = 0,
}: {
  nodes: ActionNode[];
  onChange: (next: ActionNode[]) => void;
  depth?: number;
}) {
  const { table } = useTable();
  const update = (i: number, next: ActionNode) => onChange(nodes.map((a, j) => (j === i ? next : a)));
  const remove = (i: number) => onChange(nodes.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return;
    const next = [...nodes];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const canGroup = depth < MAX_GROUP_DEPTH - 1;

  return (
    <div className="space-y-3">
      {nodes.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-token px-3 py-5 text-center text-sm text-muted">
          {depth === 0 ? "No actions yet. Add one below." : "Empty — add a step to run inside this group."}
        </p>
      )}
      {nodes.map((a, i) =>
        a.kind === "action" ? (
          <ActionStep
            key={a.id}
            index={i}
            count={nodes.length}
            action={a}
            onChange={(next) => update(i, next)}
            onRemove={() => remove(i)}
            onMove={(dir) => move(i, dir)}
          />
        ) : (
          <GroupStep
            key={a.id}
            index={i}
            count={nodes.length}
            node={a}
            depth={depth}
            onChange={(next) => update(i, next)}
            onRemove={() => remove(i)}
            onMove={(dir) => move(i, dir)}
          />
        )
      )}
      <div className="flex flex-wrap gap-2">
        <AddButton testid="action-add" icon={Plus} label="Action" onClick={() => onChange([...nodes, newAction()])} />
        {canGroup && (
          <>
            <AddButton testid="action-add-loop" icon={Repeat} label="Repeating group" onClick={() => onChange([...nodes, newLoop(table?.id ?? "")])} />
            <AddButton testid="action-add-conditional" icon={GitBranch} label="Conditional group" onClick={() => onChange([...nodes, newConditional()])} />
          </>
        )}
      </div>
    </div>
  );
}

function AddButton({
  testid,
  icon: Icon,
  label,
  onClick,
}: {
  testid: string;
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-token py-2.5 text-sm font-medium text-muted transition hover:border-accent/40 hover:bg-accent-soft/50 hover:text-accent"
    >
      <Icon size={15} /> {label}
    </button>
  );
}
