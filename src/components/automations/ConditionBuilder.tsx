"use client";

import { nanoid } from "nanoid";
import { Plus, X } from "lucide-react";
import { fieldCategory, OPS_BY_CATEGORY, OP_LABELS } from "@/lib/query";
import type { FieldDTO, FilterCondition, FilterOp } from "@/lib/types";
import type { SelectChoice } from "@/lib/fields";

export interface ConditionValue {
  conjunction: "and" | "or";
  conditions: FilterCondition[];
}

/** Value input for one condition, keyed off the field's category. */
function FilterValue({
  field,
  cond,
  onChange,
}: {
  field: FieldDTO;
  cond: FilterCondition;
  onChange: (v: unknown) => void;
}) {
  if (cond.op === "isEmpty" || cond.op === "isNotEmpty") return null;
  const cat = fieldCategory(field.type);
  const base = "w-full rounded border border-border-token px-1.5 py-0.5 text-sm outline-none focus:border-accent";

  if (cat === "boolean")
    return (
      <select className={base} value={String(cond.value ?? "true")} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">checked</option>
        <option value="false">unchecked</option>
      </select>
    );
  if (cat === "singleSelect" || cat === "multiSelect") {
    const choices = (field.options.choices as SelectChoice[]) ?? [];
    return (
      <select className={base} value={String(cond.value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    );
  }
  if (cat === "date")
    return <input type="date" className={base} value={(cond.value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  if (cat === "number")
    return <input type="number" className={base} value={(cond.value as string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />;
  return <input className={base} value={(cond.value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Value" />;
}

/**
 * Controlled filter/condition editor. Shared by the view Toolbar's FilterMenu
 * and automation condition triggers. Fully controlled: no internal state.
 */
export function ConditionBuilder({
  value,
  fields,
  onChange,
  emptyLabel = "No conditions yet.",
}: {
  value: ConditionValue;
  fields: FieldDTO[];
  onChange: (next: ConditionValue) => void;
  emptyLabel?: string;
}) {
  const { conjunction, conditions } = value;
  const set = (conds: FilterCondition[], conj = conjunction) =>
    onChange({ conjunction: conj, conditions: conds });

  function addCond() {
    const f = fields[0];
    if (!f) return;
    const op = OPS_BY_CATEGORY[fieldCategory(f.type)][0];
    set([...conditions, { id: nanoid(6), fieldId: f.id, op, value: undefined }]);
  }
  function patch(id: string, p: Partial<FilterCondition>) {
    set(conditions.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }

  return (
    <div className="space-y-2">
      {conditions.length === 0 && <p className="px-1 text-sm text-muted">{emptyLabel}</p>}
      {conditions.map((c, i) => {
        const field = fields.find((f) => f.id === c.fieldId) ?? fields[0];
        if (!field) return null;
        const ops = OPS_BY_CATEGORY[fieldCategory(field.type)];
        return (
          <div key={c.id} className="flex items-center gap-1.5">
            <span className="w-12 shrink-0 text-right text-xs text-muted">
              {i === 0 ? "Where" : (
                <select
                  value={conjunction}
                  onChange={(e) => set(conditions, e.target.value as "and" | "or")}
                  className="rounded border border-border-token px-1 py-0.5 text-xs"
                >
                  <option value="and">and</option>
                  <option value="or">or</option>
                </select>
              )}
            </span>
            <select
              value={c.fieldId}
              onChange={(e) => {
                const nf = fields.find((f) => f.id === e.target.value)!;
                patch(c.id, { fieldId: nf.id, op: OPS_BY_CATEGORY[fieldCategory(nf.type)][0], value: undefined });
              }}
              className="rounded border border-border-token px-1 py-0.5 text-sm"
            >
              {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <select
              value={c.op}
              onChange={(e) => patch(c.id, { op: e.target.value as FilterOp, value: undefined })}
              className="rounded border border-border-token px-1 py-0.5 text-sm"
            >
              {ops.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
            </select>
            <div className="flex-1">
              <FilterValue field={field} cond={c} onChange={(v) => patch(c.id, { value: v })} />
            </div>
            <button onClick={() => set(conditions.filter((x) => x.id !== c.id))} className="text-muted hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        );
      })}
      <button onClick={addCond} className="flex items-center gap-1 px-1 text-sm text-accent hover:underline">
        <Plus size={14} /> Add condition
      </button>
    </div>
  );
}
