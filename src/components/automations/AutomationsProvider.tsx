"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AutomationDTO, AutomationRunDTO, TriggerType } from "@/lib/types";

export interface SaveInput {
  name?: string;
  enabled?: boolean;
  triggerType?: TriggerType;
  triggerConfig?: Record<string, unknown>;
  actions?: { type: string; config: Record<string, unknown> }[];
}

interface AutomationsCtx {
  automations: AutomationDTO[];
  loading: boolean;
  open: boolean;
  setOpen: (b: boolean) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  create: () => Promise<AutomationDTO | null>;
  toggle: (id: string, enabled: boolean) => Promise<void>;
  save: (id: string, patch: SaveInput) => Promise<AutomationDTO | null>;
  remove: (id: string) => Promise<void>;
  fetchRuns: (id: string) => Promise<AutomationRunDTO[]>;
  testRun: (id: string, recordId: string) => Promise<AutomationRunDTO | null>;
}

const Ctx = createContext<AutomationsCtx | null>(null);

export function useAutomations() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAutomations must be used inside AutomationsProvider");
  return ctx;
}

export function AutomationsProvider({
  tableId,
  children,
}: {
  tableId: string;
  children: React.ReactNode;
}) {
  const [automations, setAutomations] = useState<AutomationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/tables/${tableId}/automations`)
      .then((r) => r.json())
      .then((list: AutomationDTO[]) => {
        if (!alive) return;
        setAutomations(Array.isArray(list) ? list : []);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [tableId]);

  const select = useCallback((id: string | null) => setSelectedId(id), []);

  const create = useCallback(async () => {
    const res = await fetch(`/api/tables/${tableId}/automations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "New automation",
        triggerType: "recordCreated",
        triggerConfig: {},
        actions: [],
      }),
    });
    if (!res.ok) return null;
    const created: AutomationDTO = await res.json();
    setAutomations((prev) => [...prev, created]);
    setSelectedId(created.id);
    return created;
  }, [tableId]);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled } : a)));
    const res = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      // revert on failure
      setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !enabled } : a)));
    }
  }, []);

  const save = useCallback(async (id: string, patch: SaveInput) => {
    const res = await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const updated: AutomationDTO = await res.json();
    setAutomations((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
  }, []);

  const fetchRuns = useCallback(async (id: string) => {
    const res = await fetch(`/api/automations/${id}/runs`);
    if (!res.ok) return [];
    return (await res.json()) as AutomationRunDTO[];
  }, []);

  const testRun = useCallback(async (id: string, recordId: string) => {
    const res = await fetch(`/api/automations/${id}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recordId }),
    });
    if (!res.ok) return null;
    return (await res.json()) as AutomationRunDTO;
  }, []);

  const value: AutomationsCtx = {
    automations, loading, open, setOpen, selectedId, select,
    create, toggle, save, remove, fetchRuns, testRun,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
