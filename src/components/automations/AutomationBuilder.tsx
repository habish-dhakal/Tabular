"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Save } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { useAutomations } from "@/components/automations/AutomationsProvider";
import { TriggerSection } from "@/components/automations/TriggerSection";
import { ActionList } from "@/components/automations/ActionList";
import { buildTree, toNested } from "@/components/automations/tree";
import type { ActionNode, AutomationDTO, TriggerType } from "@/lib/types";

interface Draft {
  name: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  actions: ActionNode[];
}

function toDraft(a: AutomationDTO): Draft {
  return {
    name: a.name,
    triggerType: a.triggerType,
    triggerConfig: a.triggerConfig ?? {},
    actions: buildTree(a.actions ?? []),
  };
}

export function AutomationBuilder({
  automation,
  onDirtyChange,
  onRan,
}: {
  automation: AutomationDTO;
  onDirtyChange: (dirty: boolean) => void;
  onRan: () => void;
}) {
  const { records } = useTable();
  const { save, testRun } = useAutomations();
  const [draft, setDraft] = useState<Draft>(() => toDraft(automation));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Reset the draft when a different automation is selected.
  useEffect(() => { setDraft(toDraft(automation)); }, [automation.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(toDraft(automation)), [draft, automation]);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  async function doSave(): Promise<boolean> {
    setSaving(true);
    const res = await save(automation.id, {
      name: draft.name.trim() || "Untitled automation",
      triggerType: draft.triggerType,
      triggerConfig: draft.triggerConfig,
      actions: toNested(draft.actions),
    });
    setSaving(false);
    return !!res;
  }

  async function doTestRun() {
    if (dirty && !(await doSave())) return;
    const record = records[0];
    if (!record) { alert("Add a record to this table first to test-run."); return; }
    setTesting(true);
    await testRun(automation.id, record.id);
    setTesting(false);
    onRan();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <input
          data-testid="automation-name"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Automation name"
          className="flex-1 rounded-lg border border-border-token bg-background px-3 py-2 text-sm font-medium outline-none transition focus:border-accent focus:ring-2 focus:ring-ring"
        />
        <button
          data-testid="automation-test-run"
          onClick={doTestRun}
          disabled={testing || saving}
          className="flex items-center gap-1.5 rounded-lg border border-border-token px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface hover:text-foreground disabled:opacity-50"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Test
        </button>
        <button
          data-testid="automation-save"
          onClick={doSave}
          disabled={!dirty || saving}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>

      <section>
        <TriggerSection
          type={draft.triggerType}
          config={draft.triggerConfig}
          onChange={(triggerType, triggerConfig) => patch({ triggerType, triggerConfig })}
        />
      </section>

      <section>
        <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Actions</h4>
        <ActionList nodes={draft.actions} onChange={(actions) => patch({ actions })} />
      </section>
    </div>
  );
}
