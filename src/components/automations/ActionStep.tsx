"use client";

import { ChevronDown, ChevronUp, Mail, MessageSquare, Sheet, PlusSquare, PencilLine, Globe, Trash2 } from "lucide-react";
import { ActionConfig } from "@/components/automations/ActionConfig";
import { automationActionTypes } from "@/server/db/schema";
import type { ActionType, AutomationAction } from "@/lib/types";

export const ACTION_META: Record<ActionType, { label: string; icon: typeof Mail }> = {
  sendEmail: { label: "Send email", icon: Mail },
  sendSlack: { label: "Send Slack message", icon: MessageSquare },
  appendGoogleSheet: { label: "Append to Google Sheet", icon: Sheet },
  createRecord: { label: "Create record", icon: PlusSquare },
  updateRecord: { label: "Update record", icon: PencilLine },
  httpRequest: { label: "Send HTTP request", icon: Globe },
};

export function ActionStep({
  index,
  action,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  action: AutomationAction;
  count: number;
  onChange: (next: AutomationAction) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const Icon = ACTION_META[action.type].icon;
  return (
    <div className="rounded-lg border border-border-token bg-surface" data-testid="action-step">
      <div className="flex items-center gap-2 border-b border-border-token px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
          {index + 1}
        </span>
        <Icon size={15} className="text-accent" />
        <select
          data-testid="action-type"
          value={action.type}
          onChange={(e) => onChange({ ...action, type: e.target.value as ActionType, config: {} })}
          className="flex-1 rounded-md border border-border-token bg-background px-2 py-1 text-sm outline-none focus:border-accent"
        >
          {automationActionTypes.map((t) => (
            <option key={t} value={t}>{ACTION_META[t].label}</option>
          ))}
        </select>
        <button disabled={index === 0} onClick={() => onMove(-1)} className="text-muted hover:text-foreground disabled:opacity-30"><ChevronUp size={15} /></button>
        <button disabled={index === count - 1} onClick={() => onMove(1)} className="text-muted hover:text-foreground disabled:opacity-30"><ChevronDown size={15} /></button>
        <button data-testid="action-remove" onClick={onRemove} className="text-muted hover:text-red-600"><Trash2 size={15} /></button>
      </div>
      <div className="p-3">
        <ActionConfig type={action.type} config={action.config} onChange={(config) => onChange({ ...action, config })} />
      </div>
    </div>
  );
}
