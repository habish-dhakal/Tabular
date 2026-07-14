"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { Trash2, Plus, GripVertical } from "lucide-react";
import type { FieldDTO } from "@/lib/types";
import type { FieldType } from "@/server/db/schema";
import { fieldTypes } from "@/server/db/schema";
import { FIELD_TYPE_META, SELECT_COLORS, type SelectChoice } from "@/lib/fields";
import { validateFormula } from "@/lib/formula";
import { useTable } from "@/components/table/TableProvider";

// Types without a proper editor yet — hidden from the picker until built,
// so users can't create a field that falls back to a broken text input.
const NON_CREATABLE: FieldType[] = [];
const ROLLUP_FNS = ["COUNT", "SUM", "AVERAGE", "MIN", "MAX", "CONCAT"];

function ChoiceEditor({
  choices,
  onChange,
}: {
  choices: SelectChoice[];
  onChange: (c: SelectChoice[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="thin-scroll max-h-56 space-y-1 overflow-y-auto pr-1">
      {choices.map((c, i) => (
        <div key={c.id} className="flex items-center gap-1.5">
          <GripVertical size={13} className="text-muted" />
          <button
            type="button"
            className="h-4 w-4 shrink-0 rounded-full"
            style={{ background: c.color }}
            onClick={() =>
              onChange(
                choices.map((x, j) =>
                  j === i
                    ? { ...x, color: SELECT_COLORS[(SELECT_COLORS.indexOf(x.color) + 1) % SELECT_COLORS.length] }
                    : x
                )
              )
            }
            title="Change color"
          />
          <input
            value={c.name}
            onChange={(e) =>
              onChange(choices.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
            }
            className="flex-1 rounded border border-border-token px-1.5 py-0.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => onChange(choices.filter((_, j) => j !== i))}
            className="text-muted hover:text-red-600"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <Plus size={13} className="text-muted" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              onChange([
                ...choices,
                {
                  id: nanoid(8),
                  name: draft.trim(),
                  color: SELECT_COLORS[choices.length % SELECT_COLORS.length],
                },
              ]);
              setDraft("");
            }
          }}
          placeholder="Add an option…"
          className="flex-1 rounded border border-border-token px-1.5 py-0.5 text-sm outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

export function FieldEditor({
  field,
  onSave,
  onClose,
}: {
  field?: FieldDTO; // undefined = creating
  onSave: (data: { name: string; type: FieldType; options: Record<string, unknown> }) => void;
  onClose: () => void;
}) {
  const { fields, tables, table } = useTable();
  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState<FieldType>(field?.type ?? "singleLineText");
  const [choices, setChoices] = useState<SelectChoice[]>(
    (field?.options.choices as SelectChoice[]) ?? []
  );
  const [expression, setExpression] = useState<string>(
    (field?.options.expression as string) ?? ""
  );
  const [linkedTableId, setLinkedTableId] = useState<string>(
    (field?.options.linkedTableId as string) ?? tables[0]?.id ?? ""
  );
  const [allowMultiple, setAllowMultiple] = useState<boolean>(
    field?.options.allowMultiple !== false
  );
  const [linkFieldId, setLinkFieldId] = useState<string>((field?.options.linkFieldId as string) ?? "");
  const [targetFieldId, setTargetFieldId] = useState<string>((field?.options.targetFieldId as string) ?? "");
  const [rollupFn, setRollupFn] = useState<string>((field?.options.fn as string) ?? "COUNT");
  const [description, setDescription] = useState<string>((field?.options.description as string) ?? "");
  const [required, setRequired] = useState<boolean>(field?.options.required === true);
  const [unique, setUnique] = useState<boolean>(field?.options.unique === true);
  const [defaultValue, setDefaultValue] = useState<string>(
    field?.options.defaultValue === undefined ? "" : String(field.options.defaultValue)
  );
  const [userAllowMultiple, setUserAllowMultiple] = useState<boolean>(field?.options.allowMultiple === true);
  const [maxSizeMB, setMaxSizeMB] = useState<string>(String(field?.options.maxSizeMB ?? 25));
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string>(
    Array.isArray(field?.options.allowedMimeTypes) ? field.options.allowedMimeTypes.map(String).join(", ") : ""
  );
  const [countLinkFieldId, setCountLinkFieldId] = useState<string>((field?.options.linkFieldId as string) ?? "");
  const [buttonLabel, setButtonLabel] = useState<string>((field?.options.label as string) ?? "Open");
  const [buttonUrl, setButtonUrl] = useState<string>((field?.options.url as string) ?? "");
  const [targetFields, setTargetFields] = useState<FieldDTO[]>([]);

  const isSelect = type === "singleSelect" || type === "multiSelect";
  const isFormula = type === "formula";
  const isLink = type === "link";
  const isExistingLink = field?.type === "link"; // target can't be changed after creation
  const isRef = type === "lookup" || type === "rollup"; // lookup / rollup
  const isUser = type === "user";
  const isAttachment = type === "attachment";
  const isCount = type === "count";
  const isButton = type === "button";
  const linkFields = fields.filter((f) => f.type === "link");
  const canHaveRequired = !isFormula && !isRef && !isCount && !isButton && !isLink;
  const canHaveUnique = canHaveRequired && !isAttachment;
  const canHaveDefault = canHaveRequired && !isAttachment;

  // When a lookup/rollup's source link field changes, load the linked table's fields.
  const effectiveLinkFieldId = linkFieldId || linkFields[0]?.id || "";
  useEffect(() => {
    if (!isRef || !effectiveLinkFieldId) { setTargetFields([]); return; }
    const lf = linkFields.find((f) => f.id === effectiveLinkFieldId);
    const linkedTableId = lf?.options.linkedTableId as string | undefined;
    if (!linkedTableId) return;
    let alive = true;
    fetch(`/api/tables/${linkedTableId}`).then((r) => r.json()).then((d) => alive && setTargetFields(d.fields ?? []));
    return () => { alive = false; };
  }, [isRef, effectiveLinkFieldId]); // eslint-disable-line react-hooks/exhaustive-deps
  const formulaError = isFormula && expression.trim() ? validateFormula(expression) : null;
  const otherFields = fields.filter((f) => f.id !== field?.id);

  function save() {
    if (!name.trim()) return;
    if (isFormula && formulaError) return;
    if (isLink && !isExistingLink && !linkedTableId) return;
    const options: Record<string, unknown> = { ...(field?.options ?? {}) };
    if (description.trim()) options.description = description.trim();
    else delete options.description;
    if (required && canHaveRequired) options.required = true;
    else delete options.required;
    if (unique && canHaveUnique) options.unique = true;
    else delete options.unique;
    if (defaultValue.trim() && canHaveDefault) options.defaultValue = defaultValue.trim();
    else delete options.defaultValue;
    if (isSelect) options.choices = choices;
    if (isFormula) options.expression = expression;
    if (isLink && !isExistingLink) { options.linkedTableId = linkedTableId; options.allowMultiple = allowMultiple; }
    if (isUser) options.allowMultiple = userAllowMultiple;
    if (isAttachment) {
      options.maxSizeMB = Number(maxSizeMB) || 25;
      options.allowedMimeTypes = allowedMimeTypes.split(",").map((item) => item.trim()).filter(Boolean);
      options.virusScanRequired = true;
    }
    if (isCount) {
      const source = countLinkFieldId || linkFields[0]?.id;
      if (!source) return;
      options.linkFieldId = source;
    }
    if (isButton) {
      options.label = buttonLabel.trim() || "Open";
      options.url = buttonUrl.trim();
    }
    if (isRef) {
      if (!effectiveLinkFieldId || !targetFieldId) return;
      options.linkFieldId = effectiveLinkFieldId;
      options.targetFieldId = targetFieldId;
      if (type === "rollup") options.fn = rollupFn;
    }
    onSave({ name: name.trim(), type, options });
    onClose();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Field name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isSelect && save()}
          className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent"
          placeholder="Name"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FieldType)}
          disabled={field?.isPrimary}
          className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60"
        >
          {fieldTypes
            .filter((t) => !NON_CREATABLE.includes(t))
            .map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_META[t].label}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full resize-y rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent"
          placeholder="Optional field guidance"
        />
      </div>
      {canHaveDefault && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Default value</label>
          <input
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent"
            placeholder="Optional default for new records"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={required && canHaveRequired} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" disabled={!canHaveRequired} />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={unique && canHaveUnique} onChange={(e) => setUnique(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" disabled={!canHaveUnique} />
          Unique
        </label>
      </div>
      {isSelect && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Options</label>
          <ChoiceEditor choices={choices} onChange={setChoices} />
        </div>
      )}
      {isLink && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Linked table</label>
            {isExistingLink ? (
              <div className="rounded-lg border border-border-token bg-surface px-2 py-1.5 text-sm text-muted">
                {tables.find((t) => t.id === linkedTableId)?.name ?? "—"} (can't change after creation)
              </div>
            ) : (
              <select
                value={linkedTableId}
                onChange={(e) => setLinkedTableId(e.target.value)}
                className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.id === table?.id ? " (this table)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!isExistingLink && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Allow linking to multiple records
            </label>
          )}
        </div>
      )}
      {isUser && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={userAllowMultiple} onChange={(e) => setUserAllowMultiple(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
          Allow assigning multiple users
        </label>
      )}
      {isAttachment && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Max file size (MB)</label>
            <input value={maxSizeMB} onChange={(e) => setMaxSizeMB(e.target.value)} type="number" min={1} className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Allowed MIME types</label>
            <input value={allowedMimeTypes} onChange={(e) => setAllowedMimeTypes(e.target.value)} className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent" placeholder="image/*, application/pdf" />
          </div>
        </div>
      )}
      {isCount && (
        linkFields.length === 0 ? (
          <p className="rounded-lg bg-surface px-2 py-2 text-xs text-muted">Create a “Link to record” field first — counts need linked records.</p>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Link field to count</label>
            <select value={countLinkFieldId || linkFields[0]?.id || ""} onChange={(e) => setCountLinkFieldId(e.target.value)} className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent">
              {linkFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )
      )}
      {isButton && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Button label</label>
            <input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">URL</label>
            <input value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent" placeholder="https://example.com" />
          </div>
        </div>
      )}
      {isRef && (
        linkFields.length === 0 ? (
          <p className="rounded-lg bg-surface px-2 py-2 text-xs text-muted">
            Create a “Link to record” field first — {type === "lookup" ? "lookups" : "rollups"} pull from linked records.
          </p>
        ) : (
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Through link field</label>
              <select
                value={effectiveLinkFieldId}
                onChange={(e) => { setLinkFieldId(e.target.value); setTargetFieldId(""); }}
                className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                {linkFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                {type === "lookup" ? "Field to look up" : "Field to roll up"}
              </label>
              <select
                value={targetFieldId}
                onChange={(e) => setTargetFieldId(e.target.value)}
                className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="">Select a field…</option>
                {targetFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            {type === "rollup" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Aggregate</label>
                <select
                  value={rollupFn}
                  onChange={(e) => setRollupFn(e.target.value)}
                  className="w-full rounded-lg border border-border-token px-2 py-1.5 text-sm outline-none focus:border-accent"
                >
                  {ROLLUP_FNS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
                </select>
              </div>
            )}
          </div>
        )
      )}
      {isFormula && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Formula</label>
          <textarea
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder={'e.g.  {Price} * {Qty}   or   IF({Done}, "✓", "…")'}
            className="h-20 w-full resize-y rounded-lg border border-border-token px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
          />
          {formulaError && <p className="mt-1 text-xs text-red-600">{formulaError}</p>}
          {otherFields.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {otherFields.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setExpression((e) => `${e}{${f.name}}`)}
                  className="rounded border border-border-token px-1.5 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
                >
                  {`{${f.name}}`}
                </button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Text: CONCATENATE, LEFT/RIGHT/MID, LEN, UPPER/LOWER, TRIM, SUBSTITUTE, REPLACE, SEARCH · Logic:
            IF, SWITCH, AND, OR, NOT, ISERROR, IFERROR · Math: ROUND(UP/DOWN), INT, ABS, SQRT, POWER, MOD,
            MIN/MAX/SUM/AVERAGE · Date: TODAY, NOW, DATEADD, DATETIME_DIFF, DATETIME_FORMAT, YEAR/MONTH/DAY,
            WEEKDAY · Use &amp; to join text.
          </p>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface"
        >
          Cancel
        </button>
        <button
          onClick={save}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {field ? "Save" : "Create field"}
        </button>
      </div>
    </div>
  );
}
