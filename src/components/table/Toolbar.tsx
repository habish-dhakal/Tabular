"use client";

import {
  EyeOff, Eye, Filter, ArrowUpDown, Group, ChevronUp, ChevronDown, Plus, X, Rows3,
} from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { useTable } from "@/components/table/TableProvider";
import { ImportExportMenu } from "@/components/table/ImportExportMenu";
import { ConditionBuilder } from "@/components/automations/ConditionBuilder";
import type { SortRule } from "@/lib/types";

function TriggerButton({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <button
      className={
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition " +
        (active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface")
      }
    >
      {children}
    </button>
  );
}

/* -------------------- Fields (hide + reorder) -------------------- */
function FieldsMenu() {
  const { fields, config, updateConfig, reorderFields } = useTable();
  const hidden = new Set(config.hiddenFieldIds ?? []);

  function toggle(id: string) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateConfig({ hiddenFieldIds: [...next] });
  }
  function move(i: number, dir: -1 | 1) {
    const order = fields.map((f) => f.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    updateConfig({ fieldOrder: order });
    reorderFields(order);
  }

  const hiddenCount = hidden.size;
  return (
    <Popover
      width={260}
      trigger={() => (
        <TriggerButton active={hiddenCount > 0}>
          <EyeOff size={14} />
          {hiddenCount > 0 ? `${hiddenCount} hidden` : "Fields"}
        </TriggerButton>
      )}
    >
      {() => (
        <div className="space-y-0.5">
          {fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-surface">
              <button onClick={() => toggle(f.id)} disabled={f.isPrimary} className="text-muted disabled:opacity-30">
                {hidden.has(f.id) ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <span className="flex-1 truncate text-sm">{f.name}</span>
              <button onClick={() => move(i, -1)} className="text-muted hover:text-foreground"><ChevronUp size={14} /></button>
              <button onClick={() => move(i, 1)} className="text-muted hover:text-foreground"><ChevronDown size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </Popover>
  );
}

/* -------------------- Filter -------------------- */
function FilterMenu() {
  const { fields, config, updateConfig } = useTable();
  const filters = config.filters ?? { conjunction: "and" as const, conditions: [] };

  return (
    <Popover
      width={420}
      trigger={() => (
        <TriggerButton active={filters.conditions.length > 0}>
          <Filter size={14} />
          {filters.conditions.length > 0 ? `${filters.conditions.length} filter` : "Filter"}
        </TriggerButton>
      )}
    >
      {() => (
        <ConditionBuilder
          value={filters}
          fields={fields}
          onChange={(next) => updateConfig({ filters: next })}
          emptyLabel="No filters yet."
        />
      )}
    </Popover>
  );
}

/* -------------------- Sort -------------------- */
function SortMenu() {
  const { fields, config, updateConfig } = useTable();
  const sorts = config.sorts ?? [];
  const set = (s: SortRule[]) => updateConfig({ sorts: s });

  return (
    <Popover
      width={320}
      trigger={() => (
        <TriggerButton active={sorts.length > 0}>
          <ArrowUpDown size={14} />
          {sorts.length > 0 ? `${sorts.length} sort` : "Sort"}
        </TriggerButton>
      )}
    >
      {() => (
        <div className="space-y-2">
          {sorts.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select
                value={s.fieldId}
                onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, fieldId: e.target.value } : x)))}
                className="flex-1 rounded border border-border-token px-1 py-0.5 text-sm"
              >
                {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select
                value={s.direction}
                onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, direction: e.target.value as "asc" | "desc" } : x)))}
                className="rounded border border-border-token px-1 py-0.5 text-sm"
              >
                <option value="asc">A → Z</option>
                <option value="desc">Z → A</option>
              </select>
              <button onClick={() => set(sorts.filter((_, j) => j !== i))} className="text-muted hover:text-red-600">
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={() => set([...sorts, { fieldId: fields[0].id, direction: "asc" }])}
            className="flex items-center gap-1 px-1 text-sm text-accent hover:underline"
          >
            <Plus size={14} /> Add sort
          </button>
        </div>
      )}
    </Popover>
  );
}

/* -------------------- Group -------------------- */
function GroupMenu() {
  const { fields, config, updateConfig } = useTable();
  return (
    <Popover
      width={240}
      trigger={() => (
        <TriggerButton active={!!config.groupBy}>
          <Group size={14} />
          {config.groupBy ? "Grouped" : "Group"}
        </TriggerButton>
      )}
    >
      {(close) => (
        <div className="space-y-0.5">
          <button
            onClick={() => { updateConfig({ groupBy: null }); close(); }}
            className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface"
          >
            None
          </button>
          {fields.map((f) => (
            <button
              key={f.id}
              onClick={() => { updateConfig({ groupBy: f.id }); close(); }}
              className={"block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface " + (config.groupBy === f.id ? "text-accent" : "")}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

/* -------------------- Row height -------------------- */
function RowHeightMenu() {
  const { config, updateConfig } = useTable();
  const opts: { k: NonNullable<typeof config.rowHeight>; label: string }[] = [
    { k: "short", label: "Short" },
    { k: "medium", label: "Medium" },
    { k: "tall", label: "Tall" },
  ];
  return (
    <Popover
      width={160}
      trigger={() => <TriggerButton><Rows3 size={14} /></TriggerButton>}
    >
      {(close) => (
        <div className="space-y-0.5">
          {opts.map((o) => (
            <button
              key={o.k}
              onClick={() => { updateConfig({ rowHeight: o.k }); close(); }}
              className={"block w-full rounded px-2 py-1 text-left text-sm hover:bg-surface " + ((config.rowHeight ?? "short") === o.k ? "text-accent" : "")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function Toolbar({ type }: { type: string }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-token bg-background px-2">
      <FieldsMenu />
      <FilterMenu />
      <SortMenu />
      {type === "grid" && <GroupMenu />}
      {type === "grid" && <RowHeightMenu />}
      <div className="ml-auto">
        <ImportExportMenu />
      </div>
    </div>
  );
}
