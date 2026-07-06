"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { Popover } from "@/components/ui/Popover";

interface Notification {
  id: string;
  type: string;
  actorName: string | null;
  tableName: string | null;
  recordId: string | null;
  body: string | null;
  read: boolean;
  createdAt: string;
}

const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* offline; ignore */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
  }

  return (
    <Popover
      width={340}
      align="right"
      trigger={() => (
        <span
          data-testid="notification-bell"
          className="relative flex items-center rounded-md px-2 py-1 hover:bg-surface"
          title="Notifications"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span
              data-testid="notification-unread"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      )}
    >
      {() => (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-sm font-medium">Notifications</span>
            {items.some((n) => !n.read) && (
              <button
                data-testid="notification-markall"
                onClick={markAll}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface"
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted">You&apos;re all caught up.</p>}
          <div className="max-h-80 space-y-0.5 overflow-auto">
            {items.map((n) => (
              <button
                key={n.id}
                data-testid="notification-item"
                onClick={() => !n.read && markRead(n.id)}
                className={
                  "block w-full rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface " +
                  (n.read ? "opacity-60" : "")
                }
              >
                <div className="flex items-center gap-1.5">
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  <span className="truncate">
                    <span className="font-medium">{n.actorName ?? "Someone"}</span> mentioned you
                    {n.tableName ? <> in <span className="font-medium">{n.tableName}</span></> : null}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                </div>
                {n.body && <p className="mt-0.5 truncate pl-3 text-xs text-muted">{n.body}</p>}
              </button>
            ))}
          </div>
        </div>
      )}
    </Popover>
  );
}
