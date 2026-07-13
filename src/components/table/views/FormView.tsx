"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { Toggle } from "@/components/ui/Toggle";
import { isComputed } from "@/lib/fields";
import type { FieldDTO } from "@/lib/types";

// Field types a form can collect. Computed fields are never writable; link/
// attachment/user need richer pickers than a form should carry (v1 limitation).
const UNSUPPORTED = new Set(["link", "attachment", "user"]);
function isFormEligible(f: FieldDTO): boolean {
  return !isComputed(f.type) && !UNSUPPORTED.has(f.type);
}

type Choice = { id: string; name: string; color: string };

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDTO;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base =
    "w-full rounded-lg border border-border-token bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring";

  switch (field.type) {
    case "longText":
      return (
        <textarea
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={base + " resize-y"}
        />
      );

    case "number":
    case "currency":
    case "percent":
      return (
        <input
          type="number"
          value={(value as number | string) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className={base}
        />
      );

    case "checkbox":
      return <Toggle checked={Boolean(value)} onChange={onChange} />;

    case "rating": {
      const max = (field.options.max as number) ?? 5;
      const cur = Number(value) || 0;
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n === cur ? 0 : n)}
              className="text-muted transition hover:scale-110"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
            >
              <Star size={20} className={n <= cur ? "fill-accent text-accent" : ""} />
            </button>
          ))}
        </div>
      );
    }

    case "date":
      return (
        <input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={base} />
      );
    case "dateTime":
      return (
        <input
          type="datetime-local"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={base}
        />
      );

    case "singleSelect": {
      const choices = (field.options.choices as Choice[]) ?? [];
      return (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || undefined)} className={base}>
          <option value="">—</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      );
    }

    case "multiSelect": {
      const choices = (field.options.choices as Choice[]) ?? [];
      const selected = new Set((value as string[]) ?? []);
      return (
        <div className="flex flex-wrap gap-1.5">
          {choices.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(c.id);
                  else next.add(c.id);
                  onChange([...next]);
                }}
                className={
                  "rounded-full px-2.5 py-1 text-xs font-medium transition " +
                  (on ? "text-white" : "bg-surface text-muted hover:text-foreground")
                }
                style={on ? { background: c.color } : undefined}
              >
                {c.name}
              </button>
            );
          })}
          {choices.length === 0 && <span className="text-xs text-muted">No options defined.</span>}
        </div>
      );
    }

    default: // singleLineText, url, email, phone
      return (
        <input
          type={field.type === "email" ? "email" : field.type === "url" ? "url" : field.type === "phone" ? "tel" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      );
  }
}

export function FormView() {
  const { fields, table, config, updateConfig, addRecord } = useTable();
  const formCfg = config.form ?? {};
  const eligible = useMemo(() => fields.filter(isFormEligible), [fields]);
  const primary = fields.find((f) => f.isPrimary);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = formCfg.title ?? table?.name ?? "Untitled form";
  const submitLabel = formCfg.submitLabel?.trim() || "Submit";

  async function submit() {
    setError(null);
    // Primary field is required — a record with no primary value is meaningless.
    if (primary && !String(values[primary.id] ?? "").trim()) {
      setError(`${primary.name} is required.`);
      return;
    }
    const cells: Record<string, unknown> = {};
    for (const f of eligible) {
      const v = values[f.id];
      if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) cells[f.id] = v;
    }
    setSubmitting(true);
    const rec = await addRecord(cells);
    setSubmitting(false);
    if (!rec) {
      setError("Couldn't submit — please check your entries and try again.");
      return;
    }
    setValues({});
    setDone(true);
  }

  if (done) {
    return (
      <div className="thin-scroll h-full overflow-auto bg-surface p-6">
        <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-border-token bg-background p-10 text-center shadow-xs">
          <CheckCircle2 size={40} className="mx-auto text-accent" />
          <h2 className="mt-3 text-lg font-semibold tracking-tight">Response recorded</h2>
          <p className="mt-1 text-sm text-muted">Thanks — your entry was added to {table?.name}.</p>
          <button
            onClick={() => setDone(false)}
            className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover"
          >
            Submit another response
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="thin-scroll h-full overflow-auto bg-surface p-6" data-testid="form-view">
      <div className="mx-auto max-w-xl">
        {/* Editable header — persisted to the view config (debounced). */}
        <div className="rounded-t-2xl border border-b-0 border-border-token bg-background px-6 pt-6 pb-4">
          <input
            value={title}
            onChange={(e) => updateConfig({ form: { ...formCfg, title: e.target.value } })}
            placeholder="Form title"
            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted/50"
          />
          <textarea
            value={formCfg.description ?? ""}
            onChange={(e) => updateConfig({ form: { ...formCfg, description: e.target.value } })}
            placeholder="Add a description (optional)"
            rows={1}
            className="mt-1 w-full resize-none bg-transparent text-sm text-muted outline-none placeholder:text-muted/50"
          />
        </div>

        {/* Fields */}
        <div data-testid="form-fields" className="space-y-5 rounded-b-2xl border border-border-token bg-background px-6 py-6 shadow-xs">
          {eligible.map((f) => (
            <div key={f.id}>
              <label className="mb-1.5 block text-sm font-medium">
                {f.name}
                {f.isPrimary && <span className="ml-1 text-red-500">*</span>}
              </label>
              <FieldControl
                field={f}
                value={values[f.id]}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
              />
            </div>
          ))}
          {eligible.length === 0 && (
            <p className="text-sm text-muted">This table has no fields a form can collect yet.</p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={submitting || eligible.length === 0}
            data-testid="form-submit"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? "Submitting…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
