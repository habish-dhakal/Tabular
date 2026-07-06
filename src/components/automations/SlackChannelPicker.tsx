"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Hash, User, Loader2 } from "lucide-react";
import { Popover } from "@/components/ui/Popover";

interface SlackTarget {
  id: string;
  name: string;
  kind: "channel" | "user";
}
interface TargetsResponse {
  configured: boolean;
  error?: string;
  channels: SlackTarget[];
  users: SlackTarget[];
}

// Cache the fetch across every picker instance for the session.
let cache: Promise<TargetsResponse> | null = null;
function loadTargets(): Promise<TargetsResponse> {
  if (!cache) {
    cache = fetch("/api/slack/targets")
      .then((r) => r.json())
      .catch(() => ({ configured: false, channels: [], users: [] as SlackTarget[] }));
  }
  return cache;
}

const inputCls =
  "w-full rounded-md border border-border-token bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

export function SlackChannelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [data, setData] = useState<TargetsResponse | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => { loadTargets().then(setData); }, []);

  const all = data ? [...data.channels, ...data.users] : [];
  const selected = all.find((t) => t.id === value);
  const label = selected?.name ?? (value || "Select channel or user…");

  const match = (t: SlackTarget) => t.name.toLowerCase().includes(q.toLowerCase());
  const channels = data?.channels.filter(match) ?? [];
  const users = data?.users.filter(match) ?? [];

  return (
    <Popover
      width={280}
      trigger={() => (
        <button
          type="button"
          data-testid="slack-target"
          className={inputCls + " flex items-center gap-1.5 text-left " + (selected ? "" : "text-muted")}
        >
          {selected?.kind === "user" ? <User size={13} /> : selected?.kind === "channel" ? <Hash size={13} /> : null}
          <span className="flex-1 truncate">{label}</span>
          <ChevronDown size={14} className="text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-2">
          {!data && (
            <div className="flex justify-center py-3 text-muted"><Loader2 className="animate-spin" size={16} /></div>
          )}
          {data && (
            <>
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search channels & people…"
                className={inputCls}
              />
              {!data.configured && (
                <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                  Slack isn’t connected{data.error ? `: ${data.error}` : ""}. Enter a channel ID or name below.
                </p>
              )}
              <div className="max-h-64 space-y-2 overflow-auto">
                {channels.length > 0 && (
                  <div>
                    <div className="px-1 pb-0.5 text-[11px] font-medium uppercase text-muted">Channels</div>
                    {channels.map((c) => (
                      <TargetRow key={c.id} t={c} active={c.id === value} onClick={() => { onChange(c.id); close(); }} />
                    ))}
                  </div>
                )}
                {users.length > 0 && (
                  <div>
                    <div className="px-1 pb-0.5 text-[11px] font-medium uppercase text-muted">People</div>
                    {users.map((u) => (
                      <TargetRow key={u.id} t={u} active={u.id === value} onClick={() => { onChange(u.id); close(); }} />
                    ))}
                  </div>
                )}
                {data.configured && channels.length === 0 && users.length === 0 && (
                  <p className="px-1 py-2 text-xs text-muted">No matches.</p>
                )}
              </div>
              <div className="border-t border-border-token pt-2">
                <label className="mb-1 block text-[11px] text-muted">Custom value / token</label>
                <input
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="#channel, ID, or {{token}}"
                  className={inputCls}
                />
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

function TargetRow({ t, active, onClick }: { t: SlackTarget; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm hover:bg-surface " +
        (active ? "text-accent" : "")
      }
    >
      {t.kind === "user" ? <User size={13} className="shrink-0 text-muted" /> : <Hash size={13} className="shrink-0 text-muted" />}
      <span className="truncate">{t.name}</span>
    </button>
  );
}
