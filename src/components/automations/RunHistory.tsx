"use client";

import { useEffect, useState } from "react";
import { ChevronRight, RefreshCw, Loader2 } from "lucide-react";
import { useAutomations } from "@/components/automations/AutomationsProvider";
import { ACTION_META } from "@/components/automations/ActionStep";
import type { AutomationRunDTO, RunStatus } from "@/lib/types";

const STATUS_DOT: Record<RunStatus, string> = {
  running: "bg-amber-500",
  success: "bg-emerald-500",
  error: "bg-red-500",
  skipped: "bg-muted",
};

function timeOf(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
}

export function RunHistory({ automationId, refreshKey }: { automationId: string; refreshKey: number }) {
  const { fetchRuns } = useAutomations();
  const [runs, setRuns] = useState<AutomationRunDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchRuns(automationId).then((r) => {
      if (!alive) return;
      setRuns(r);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [automationId, refreshKey, fetchRuns]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function refresh() {
    setLoading(true);
    const r = await fetchRuns(automationId);
    setRuns(r);
    setLoading(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Run history</h4>
        <button
          onClick={refresh}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading && <div className="flex justify-center py-6 text-muted"><Loader2 className="animate-spin" size={18} /></div>}
      {!loading && runs.length === 0 && (
        <p className="rounded-lg border border-dashed border-border-token px-3 py-6 text-center text-sm text-muted">
          No runs yet.
        </p>
      )}

      {!loading &&
        runs.map((run) => {
          const isOpen = expanded.has(run.id);
          return (
            <div key={run.id} className="rounded-lg border border-border-token">
              <button
                data-testid="run-row"
                onClick={() => toggle(run.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <ChevronRight size={14} className={"text-muted transition-transform " + (isOpen ? "rotate-90" : "")} />
                <span className={"h-2 w-2 shrink-0 rounded-full " + STATUS_DOT[run.status]} />
                <span className="text-sm capitalize">{run.status}</span>
                <span className="ml-auto text-xs text-muted">{timeOf(run.startedAt)}</span>
              </button>
              {isOpen && (
                <div className="space-y-1.5 border-t border-border-token px-3 py-2">
                  {run.error && <p className="text-xs text-red-600">{run.error}</p>}
                  {run.steps.length === 0 && <p className="text-xs text-muted">No steps ran.</p>}
                  {run.steps.map((step) => (
                    <div key={step.id} className="rounded-md bg-surface px-2 py-1.5" data-testid="run-step">
                      <div className="flex items-center gap-2">
                        <span className={"h-1.5 w-1.5 rounded-full " + STATUS_DOT[step.status as RunStatus]} />
                        <span className="text-xs font-medium">{ACTION_META[step.type]?.label ?? step.type}</span>
                        <span className="ml-auto text-[11px] text-muted">{step.status}</span>
                      </div>
                      {step.error && <p className="mt-1 text-[11px] text-red-600">{step.error}</p>}
                      <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-1.5 text-[11px] text-muted">
                        {JSON.stringify(step.input, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
