"use client";

import { useTable } from "@/components/table/TableProvider";
import { ConditionBuilder, type ConditionValue } from "@/components/automations/ConditionBuilder";
import { ScheduleBuilder } from "@/components/automations/ScheduleBuilder";
import { automationTriggerTypes } from "@/server/db/schema";
import type { FilterCondition, TriggerType } from "@/lib/types";

const TRIGGER_LABELS: Record<TriggerType, string> = {
  recordCreated: "When a record is created",
  recordUpdated: "When a record is updated",
  recordMatchesCondition: "When a record matches conditions",
  recordEntersCondition: "When a record enters a condition",
  recordDeleted: "When a record is deleted",
  scheduled: "On a schedule",
};

const inputCls =
  "w-full rounded-md border border-border-token bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

export function TriggerSection({
  type,
  config,
  onChange,
}: {
  type: TriggerType;
  config: Record<string, unknown>;
  onChange: (type: TriggerType, config: Record<string, unknown>) => void;
}) {
  const { fields } = useTable();
  const setConfig = (c: Record<string, unknown>) => onChange(type, c);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Trigger</label>
        <select
          data-testid="trigger-type"
          value={type}
          onChange={(e) => onChange(e.target.value as TriggerType, {})}
          className={inputCls}
        >
          {automationTriggerTypes.map((t) => (
            <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
          ))}
        </select>
      </div>

      {type === "recordUpdated" && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={config.watch !== "fields"}
              onChange={() => setConfig({ watch: "all" })}
              className="accent-[var(--accent)]"
            />
            Any field changes
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={config.watch === "fields"}
              onChange={() => setConfig({ watch: "fields", fieldIds: [] })}
              className="accent-[var(--accent)]"
            />
            Specific fields change
          </label>
          {config.watch === "fields" && (
            <div className="ml-6 space-y-1 rounded-md border border-border-token p-2">
              {fields.map((f) => {
                const ids = (config.fieldIds as string[]) ?? [];
                const on = ids.includes(f.id);
                return (
                  <label key={f.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setConfig({
                          watch: "fields",
                          fieldIds: on ? ids.filter((x) => x !== f.id) : [...ids, f.id],
                        })
                      }
                      className="accent-[var(--accent)]"
                    />
                    {f.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {(type === "recordMatchesCondition" || type === "recordEntersCondition") && (
        <ConditionBuilder
          value={
            {
              conjunction: (config.conjunction as "and" | "or") ?? "and",
              conditions: (config.conditions as FilterCondition[]) ?? [],
            } satisfies ConditionValue
          }
          fields={fields}
          onChange={(next) => setConfig({ conjunction: next.conjunction, conditions: next.conditions })}
        />
      )}

      {type === "scheduled" && <ScheduleBuilder config={config} onChange={setConfig} />}

      {(type === "recordCreated" || type === "recordDeleted") && (
        <p className="text-xs text-muted">
          Runs for every record {type === "recordCreated" ? "created" : "deleted"} in this table.
        </p>
      )}
    </div>
  );
}
