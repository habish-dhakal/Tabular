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
import type { CellPatch } from "@/lib/grid-state";
import type { ViewQueryMode, ViewRecordPage } from "@/lib/view-query";
import { useDialog } from "@/components/ui/DialogProvider";

interface TableCtx {
  loading: boolean;
  table: TableBundle["table"] | null;
  fields: FieldDTO[];
  records: RecordDTO[];
  recordLoading: boolean;
  recordTotal: number | null;
  recordsLoaded: number;
  hasMoreRecords: boolean;
  viewQueryMode: ViewQueryMode | null;
  viewQueryWarning: string | null;
  viewSearch: string;
  setViewSearch: (search: string) => void;
  loadMoreRecords: () => Promise<void>;
  views: ViewDTO[];
  activeView: ViewDTO | null;
  setActiveViewId: (id: string) => void;
  config: ViewConfig;
  updateConfig: (patch: Partial<ViewConfig>) => void;
  reloadTable: () => Promise<void>;

  tables: TableDTO[]; // sibling tables in the base (for link fields)
  commitCell: (recordId: string, fieldId: string, value: unknown) => Promise<void>;
  commitCells: (patches: CellPatch[]) => Promise<void>;
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

export function TableProvider({
  tableId,
  initialViewId,
  onViewChange,
  children,
}: {
  tableId: string;
  initialViewId?: string;
  onViewChange?: (viewId: string | null) => void;
  children: React.ReactNode;
}) {
  const dialog = useDialog();
  const [loading, setLoading] = useState(true);
  const [table, setTable] = useState<TableBundle["table"] | null>(null);
  const [fields, setFields] = useState<FieldDTO[]>([]);
  const [records, setRecords] = useState<RecordDTO[]>([]);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordTotal, setRecordTotal] = useState<number | null>(null);
  const [recordsLoaded, setRecordsLoaded] = useState(0);
  const [hasMoreRecords, setHasMoreRecords] = useState(false);
  const [nextRecordCursor, setNextRecordCursor] = useState<string | null>(null);
  const [viewQueryMode, setViewQueryMode] = useState<ViewQueryMode | null>(null);
  const [viewQueryWarning, setViewQueryWarning] = useState<string | null>(null);
  const [viewSearch, setViewSearch] = useState("");
  const [views, setViews] = useState<ViewDTO[]>([]);
  const [tables, setTables] = useState<TableDTO[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/tables/${tableId}`).then((r) => r.json()).then((bundle: TableBundle) => {
      if (!alive) return;
      setTable(bundle.table);
      setFields([...bundle.fields].sort((a, b) => a.position - b.position));
      setViews(bundle.views);
      const nextViewId = viewIdForBundle(bundle.views, initialViewId);
      setActiveViewId(nextViewId);
      if (!initialViewId) onViewChange?.(nextViewId);
      setLoading(false);
      // Sibling tables in the base — used as link targets.
      fetch(`/api/bases/${bundle.table.baseId}/tables`)
        .then((r) => r.json())
        .then((d) => alive && setTables(d.tables ?? []));
    });
    return () => {
      alive = false;
    };
  }, [initialViewId, onViewChange, tableId]);

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );
  const config = activeView?.config ?? {};

  const selectView = useCallback((viewId: string) => {
    setActiveViewId(viewId);
    onViewChange?.(viewId);
  }, [onViewChange]);

  const fetchViewRecords = useCallback(async (
    viewId: string,
    options: { append?: boolean; cursor?: string | null; search?: string } = {}
  ) => {
    setRecordLoading(true);
    const params = new URLSearchParams({
      limit: "500",
      includeTotal: "true",
    });
    const search = options.search ?? viewSearch;
    if (search) params.set("search", search);
    if (options.cursor) params.set("cursor", options.cursor);
    try {
      const page: ViewRecordPage = await fetch(`/api/views/${viewId}/records?${params.toString()}`).then((r) => r.json());
      setRecords((prev) => options.append ? [...prev, ...(page.records ?? [])] : page.records ?? []);
      setRecordTotal(page.total);
      setRecordsLoaded((prev) => options.append ? prev + (page.records?.length ?? 0) : page.records?.length ?? 0);
      setHasMoreRecords(page.hasMore);
      setNextRecordCursor(page.nextCursor);
      setViewQueryMode(page.mode);
      setViewQueryWarning(page.warning ?? null);
    } finally {
      setRecordLoading(false);
    }
  }, [viewSearch]);

  const reloadRecords = useCallback(async () => {
    if (!activeViewId) {
      setRecords([]);
      setRecordTotal(null);
      setRecordsLoaded(0);
      setHasMoreRecords(false);
      setNextRecordCursor(null);
      return;
    }
    await fetchViewRecords(activeViewId, { search: viewSearch });
  }, [activeViewId, fetchViewRecords, viewSearch]);

  const loadMoreRecords = useCallback(async () => {
    if (!activeViewId || !nextRecordCursor || recordLoading) return;
    await fetchViewRecords(activeViewId, { append: true, cursor: nextRecordCursor, search: viewSearch });
  }, [activeViewId, fetchViewRecords, nextRecordCursor, recordLoading, viewSearch]);

  useEffect(() => {
    if (!activeViewId) return;
    void fetchViewRecords(activeViewId, { search: viewSearch });
  }, [activeViewId, fetchViewRecords, viewSearch]);

  const reloadTable = useCallback(async () => {
    const bundle: TableBundle = await fetch(`/api/tables/${tableId}`).then((r) => r.json());
    setTable(bundle.table);
    setFields([...bundle.fields].sort((a, b) => a.position - b.position));
    setViews(bundle.views);
    setActiveViewId((current) => {
      const nextViewId = viewIdForBundle(bundle.views, current ?? initialViewId);
      if (!initialViewId) onViewChange?.(nextViewId);
      return nextViewId;
    });
    const siblings = await fetch(`/api/bases/${bundle.table.baseId}/tables`).then((r) => r.json());
    setTables(siblings.tables ?? []);
    setLoading(false);
  }, [initialViewId, onViewChange, tableId]);

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
        }).then((res) => {
          if (!res.ok) return res.json().then((body) => {
            throw new Error(body.error ?? "View update failed");
          });
          if (activeView.id === viewId) void fetchViewRecords(viewId, { search: viewSearch });
        }).catch((err) => {
          void dialog.alert({ title: "View update rejected", message: err instanceof Error ? err.message : "Failed" });
          void reloadTable();
        });
      }, 400);
    },
    [activeView, dialog, fetchViewRecords, reloadTable, viewSearch]
  );

  /* ---- record mutations ---- */
  const applyCellPatch = (cells: Record<string, unknown>, fieldId: string, value: unknown) => {
    const next = { ...cells };
    if (value === null || value === undefined) delete next[fieldId];
    else next[fieldId] = value;
    return next;
  };
  const valueForPayload = (value: unknown) => (value === undefined ? null : value);

  const commitCell = useCallback(async (recordId: string, fieldId: string, value: unknown) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.id === recordId ? { ...r, cells: applyCellPatch(r.cells, fieldId, value) } : r
      )
    );
    const res = await fetch(`/api/records/${recordId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cells: { [fieldId]: valueForPayload(value) } }),
    });
    if (res.ok) {
      await reloadRecords();
    } else {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      await reloadRecords();
      void dialog.alert({ title: "Cell update rejected", message: error });
    }
  }, [dialog, reloadRecords]);

  const commitCells = useCallback(async (patches: CellPatch[]) => {
    if (patches.length === 0) return;
    const byRecord = new Map<string, CellPatch[]>();
    for (const patch of patches) byRecord.set(patch.recordId, [...(byRecord.get(patch.recordId) ?? []), patch]);

    setRecords((prev) =>
      prev.map((record) => {
        const mine = byRecord.get(record.id);
        if (!mine) return record;
        const cells = mine.reduce(
          (next, patch) => applyCellPatch(next, patch.fieldId, patch.value),
          record.cells
        );
        return { ...record, cells };
      })
    );

    try {
      const updated = await Promise.all(
        [...byRecord.entries()].map(async ([recordId, mine]) => {
          const res = await fetch(`/api/records/${recordId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              cells: Object.fromEntries(mine.map((patch) => [patch.fieldId, valueForPayload(patch.value)])),
            }),
          });
          if (res.ok) return (await res.json()) as RecordDTO;
          const { error } = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(error);
        })
      );
      setRecords((prev) =>
        prev.map((record) => updated.find((next) => next?.id === record.id) ?? record)
      );
      await reloadRecords();
    } catch (err) {
      await reloadRecords();
      void dialog.alert({ title: "Cell update rejected", message: err instanceof Error ? err.message : "Failed" });
    }
  }, [dialog, reloadRecords]);

  const addRecord = useCallback(
    async (cells: Record<string, unknown> = {}) => {
      const res = await fetch(`/api/tables/${tableId}/records`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cells }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        void dialog.alert({ title: "Record rejected", message: error });
        return null;
      }
      const rec: RecordDTO = await res.json();
      await reloadRecords();
      return rec;
    },
    [dialog, tableId]
  );

  const deleteRecord = useCallback(async (recordId: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== recordId));
    setRecordTotal((prev) => (typeof prev === "number" ? Math.max(0, prev - 1) : prev));
    setRecordsLoaded((prev) => Math.max(0, prev - 1));
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
    // Re-fetch so dependent lookup/rollup fields (computed server-side from the
    // link edges) reflect the change.
    await reloadRecords();
  }, [reloadRecords]);

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
        void dialog.alert({ title: "Something went wrong", message: error });
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
        await reloadRecords();
      }
    } else {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      void dialog.alert({ title: "Something went wrong", message: error });
    }
  }, [reloadRecords, tableId]);

  const deleteField = useCallback(async (fieldId: string) => {
    const res = await fetch(`/api/fields/${fieldId}`, { method: "DELETE" });
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
    } else {
      const { error } = await res.json().catch(() => ({ error: "Failed" }));
      void dialog.alert({ title: "Something went wrong", message: error });
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
      selectView(view.id);
      return view;
    },
    [selectView, tableId]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      const res = await fetch(`/api/views/${viewId}`, { method: "DELETE" });
      if (res.ok) {
        setViews((prev) => {
          const next = prev.filter((v) => v.id !== viewId);
          setActiveViewId((cur) => {
            const nextViewId = cur === viewId ? next[0]?.id ?? null : cur;
            onViewChange?.(nextViewId);
            return nextViewId;
          });
          return next;
        });
      } else {
        const { error } = await res.json().catch(() => ({ error: "Failed" }));
        void dialog.alert({ title: "Something went wrong", message: error });
      }
    },
    [onViewChange]
  );

  const value: TableCtx = {
    loading, table, fields, records, recordLoading, recordTotal, recordsLoaded,
    hasMoreRecords, viewQueryMode, viewQueryWarning, viewSearch, setViewSearch,
    loadMoreRecords, views, activeView, tables,
    setActiveViewId: selectView, config, updateConfig, reloadTable,
    commitCell, commitCells, addRecord, deleteRecord, setRecordLinks,
    addField, updateField, deleteField, reorderFields,
    createView, deleteView,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { FIELD_TYPE_META };

function viewIdForBundle(views: ViewDTO[], requested?: string | null) {
  return requested && views.some((view) => view.id === requested) ? requested : views[0]?.id ?? null;
}
