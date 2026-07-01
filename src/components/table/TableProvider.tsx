"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FieldDTO, RecordDTO, TableBundle, TableDTO, ViewConfig, ViewDTO } from "@/lib/types";
import type { LinkChip } from "@/components/cell-editors/LinkPicker";
import type { FieldType, ViewType } from "@/server/db/schema";
import { FIELD_TYPE_META } from "@/lib/fields";

interface TableCtx {
  loading: boolean;
  table: TableBundle["table"] | null;
  fields: FieldDTO[];
  records: RecordDTO[];
  views: ViewDTO[];
  activeView: ViewDTO | null;
  setActiveViewId: (id: string) => void;
  config: ViewConfig;
  updateConfig: (patch: Partial<ViewConfig>) => void;

  tables: TableDTO[]; // sibling tables in the base (for link fields)
  commitCell: (recordId: string, fieldId: string, value: unknown) => Promise<void>;
  addRecord: (cells?: Record<string, unknown>) => Promise<RecordDTO | null>;
  deleteRecord: (recordId: string) => Promise<void>;
  setRecordLinks: (recordId: string, fieldId: string, chips: LinkChip[]) => Promise<void>;

  addField: (name: string, type: FieldType, options?: Record<string, unknown>) => Promise<void>;
  updateField: (fieldId: string, patch: Partial<FieldDTO>) => Promise<void>;
  deleteField: (fieldId: string) => Promise<void>;
  reorderFields: (order: string[]) => Promise<void>;

  createView: (name: string, type: ViewType) => Promise<ViewDTO | null>;
  deleteView: (viewId: string) => Promise<void>;
}

const Ctx = createContext<TableCtx | null>(null);

export function useTable() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTable must be used inside TableProvider");
  return ctx;
}

export function TableProvider({ tableId, children }: { tableId: string; children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [table, setTable] = useState<TableBundle["table"] | null>(null);
  const [fields, setFields] = useState<FieldDTO[]>([]);
  const [records, setRecords] = useState<RecordDTO[]>([]);
  const [views, setViews] = useState<ViewDTO[]>([]);
  const [tables, setTables] = useState<TableDTO[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/tables/${tableId}`).then((r) => r.json()),
      fetch(`/api/tables/${tableId}/records`).then((r) => r.json()),
    ]).then(([bundle, recs]: [TableBundle, { records: RecordDTO[] }]) => {
      if (!alive) return;
      setTable(bundle.table);
      setFields([...bundle.fields].sort((a, b) => a.position - b.position));
      setViews(bundle.views);
      setActiveViewId(bundle.views[0]?.id ?? null);
      setRecords(recs.records ?? []);
      setLoading(false);
      // Sibling tables in the base — used as link targets.
      fetch(`/api/bases/${bundle.table.baseId}/tables`)
        .then((r) => r.json())
        .then((d) => alive && setTables(d.tables ?? []));
    });
    return () => {
      alive = false;
    };
  }, [tableId]);

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );
  const config = activeView?.config ?? {};

  /* ---- debounced view-config persistence ---- */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateConfig = useCallback(
    (patch: Partial<ViewConfig>) => {
      if (!activeView) return;
      const next = { ...activeView.config, ...patch };
      setViews((prev) =>
        prev.map((v) => (v.id === activeView.id ? { ...v, config: next } : v))
      );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const viewId = activeView.id;
      saveTimer.current = setTimeout(() => {
        fetch(`/api/views/${viewId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ config: next }),
        });
      }, 400);
    },
    [activeView]
  );

  /* ---- record mutations ---- */
  const commitCell = useCallback(async (recordId: string, fieldId: string, value: unknown) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId ? { ...r, cells: { ...r.cells, [fieldId]: value ?? undefined } } : r
      )
    );
    const res = await fetch(`/api/records/${recordId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cells: { [fieldId]: value } }),
    });
    if (res.ok) {
      const updated: RecordDTO = await res.json();
      setRecords((prev) => prev.map((r) => (r.id === recordId ? updated : r)));
    }
  }, []);

  const addRecord = useCallback(
    async (cells: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/tables/${tableId}/records`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cells }),
      });
      if (!res.ok) return null;
      const rec: RecordDTO = await res.json();
      setRecords((prev) => [...prev, rec]);
      return rec;
    },
    [tableId]
  );

  const deleteRecord = useCallback(async (recordId: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
    await fetch(`/api/records/${recordId}`, { method: "DELETE" });
  }, []);

  const setRecordLinks = useCallback(async (recordId: string, fieldId: string, chips: LinkChip[]) => {
    // Optimistically set the resolved chips into cells (matches server enrichment).
    setRecords((prev) =>
      prev.map((r) => (r.id === recordId ? { ...r, cells: { ...r.cells, [fieldId]: chips } } : r))
    );
    await fetch(`/api/records/${recordId}/links`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fieldId, targetIds: chips.map((c) => c.id) }),
    });
  }, []);

  /* ---- field mutations ---- */
  const addField = useCallback(
    async (name: string, type: FieldType, options?: Record<string, unknown>) => {
      const res = await fetch(`/api/tables/${tableId}/fields`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, type, options }),
      });
      if (res.ok) {
        const field: FieldDTO = await res.json();
        setFields((prev) => [...prev, field].sort((a, b) => a.position - b.position));
      } else {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        alert(error);
      }
    },
    [tableId]
  );

  const updateField = useCallback(async (fieldId: string, patch: Partial<FieldDTO>) => {
    const res = await fetch(`/api/fields/${fieldId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const field: FieldDTO = await res.json();
      setFields((prev) =>
        prev.map((f) => (f.id === fieldId ? field : f)).sort((a, b) => a.position - b.position)
      );
      // A type change may have rewritten stored cells — refetch records.
      if (patch.type) {
        const recs = await fetch(`/api/tables/${tableId}/records`).then((r) => r.json());
        setRecords(recs.records ?? []);
      }
    } else {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      alert(error);
    }
  }, [tableId]);

  const deleteField = useCallback(async (fieldId: string) => {
    const res = await fetch(`/api/fields/${fieldId}`, { method: "DELETE" });
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } else {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      alert(error);
    }
  }, []);

  const reorderFields = useCallback(
    async (order: string[]) => {
      setFields((prev) => {
        const byId = new Map(prev.map((f) => [f.id, f]));
        return order.map((id, i) => ({ ...byId.get(id)!, position: i }));
      });
      await fetch(`/api/tables/${tableId}/fields/reorder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order }),
      });
    },
    [tableId]
  );

  /* ---- view mutations ---- */
  const createView = useCallback(
    async (name: string, type: ViewType) => {
      const res = await fetch(`/api/tables/${tableId}/views`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) return null;
      const view: ViewDTO = await res.json();
      setViews((prev) => [...prev, view]);
      setActiveViewId(view.id);
      return view;
    },
    [tableId]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      const res = await fetch(`/api/views/${viewId}`, { method: "DELETE" });
      if (res.ok) {
        setViews((prev) => {
          const next = prev.filter((v) => v.id !== viewId);
          setActiveViewId((cur) => (cur === viewId ? next[0]?.id ?? null : cur));
          return next;
        });
      } else {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        alert(error);
      }
    },
    []
  );

  const value: TableCtx = {
    loading, table, fields, records, views, activeView, tables,
    setActiveViewId, config, updateConfig,
    commitCell, addRecord, deleteRecord, setRecordLinks,
    addField, updateField, deleteField, reorderFields,
    createView, deleteView,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { FIELD_TYPE_META };
