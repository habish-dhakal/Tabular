"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Trash2, Maximize2 } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { RecordModal } from "@/components/table/RecordModal";
import { FieldHeaderMenu } from "@/components/table/FieldHeaderMenu";
import { FieldEditor } from "@/components/table/FieldEditor";
import { Popover } from "@/components/ui/Popover";
import { CellPopover } from "@/components/cell-editors/CellPopover";
import { LinkPicker, type LinkChip } from "@/components/cell-editors/LinkPicker";
import { CellDisplay, CellEditor } from "@/components/Cell";
import { FIELD_TYPE_META, isComputed, type SelectChoice } from "@/lib/fields";
import { groupRecords } from "@/lib/query";
import { computeCellValue } from "@/lib/compute";
import {
  EMPTY_HISTORY,
  cellsInRange,
  createPastePlan,
  matrixToClipboardText,
  parseClipboardMatrix,
  pushHistory,
  rangeBounds,
  redoHistory,
  sameCell,
  selectionAfterMove,
  undoHistory,
  valueForClipboard,
  type CellPatch,
  type GridCell,
  type GridRange,
} from "@/lib/grid-state";
import type { FieldDTO, RecordDTO } from "@/lib/types";

const GUTTER_W = 56;
const DEFAULT_COL_W = 180;
const PRIMARY_COL_W = 240;
const ADD_COL_W = 120;
const ROW_HEIGHTS = { short: 36, medium: 48, tall: 68 } as const;
// Rows grow to fit wrapped multi-value cells, but never past this — beyond it the
// cell scrolls internally so one link-heavy record can't dominate the viewport.
const MAX_ROW_H = 160;
const HEADER_H = 32;

type Item =
  | { kind: "group"; key: string; label: string; color?: string; count: number }
  | { kind: "row"; record: RecordDTO };

const cellKey = (cell: GridCell) => `${cell.row}:${cell.col}`;

function orderFieldsForView(fields: FieldDTO[], order: string[] | undefined): FieldDTO[] {
  if (!order?.length) return fields;
  const byId = new Map(fields.map((field) => [field.id, field]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as FieldDTO[];
  const seen = new Set(ordered.map((field) => field.id));
  return [...ordered, ...fields.filter((field) => !seen.has(field.id))];
}

export function GridView() {
  const {
    fields, records, config, updateConfig, commitCells, addRecord, deleteRecord, addField, setRecordLinks,
    hasMoreRecords, loadMoreRecords, recordLoading, recordTotal, viewQueryWarning,
  } = useTable();
  const parentRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ recordId: string; fieldId: string; rect?: DOMRect } | null>(null);
  const [viewing, setViewing] = useState<{ recordId: string; fieldId: string; rect: DOMRect } | null>(null);
  const [expanded, setExpanded] = useState<RecordDTO | null>(null);
  const [selection, setSelection] = useState<GridRange | null>(null);
  const [history, setHistory] = useState(EMPTY_HISTORY);
  const [notice, setNotice] = useState<string | null>(null);
  const pasteStateRef = useRef<{
    activeCell: GridCell | null;
    editing: typeof editing;
    rows: RecordDTO[];
    visibleFields: FieldDTO[];
  }>({ activeCell: null, editing: null, rows: [], visibleFields: [] });

  const rowH = ROW_HEIGHTS[config.rowHeight ?? "short"];
  const hidden = new Set(config.hiddenFieldIds ?? []);
  const orderedFields = useMemo(() => orderFieldsForView(fields, config.fieldOrder), [fields, config.fieldOrder]);
  const visibleFields = orderedFields.filter((f) => !hidden.has(f.id));
  const colWidth = useCallback((f: FieldDTO) => {
    const width = config.fieldWidths?.[f.id];
    return Math.max(96, Number(width) || (f.isPrimary ? PRIMARY_COL_W : DEFAULT_COL_W));
  }, [config.fieldWidths]);
  const totalWidth =
    GUTTER_W + visibleFields.reduce((s, f) => s + colWidth(f), 0) + ADD_COL_W;

  const groupField = config.groupBy ? fields.find((f) => f.id === config.groupBy) : undefined;

  const rows = records;
  const rowIndexById = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  const items = useMemo<Item[]>(() => {
    if (!groupField) return rows.map((r) => ({ kind: "row", record: r }) as Item);
    const groups = groupRecords(rows, groupField);
    const choices = (groupField.options.choices as SelectChoice[]) ?? [];
    const out: Item[] = [];
    for (const g of groups) {
      const choice = choices.find((c) => c.id === g.key);
      out.push({
        kind: "group",
        key: g.key,
        label: g.value == null ? "Empty" : choice?.name ?? String(g.value),
        color: choice?.color,
        count: g.records.length,
      });
      for (const r of g.records) out.push({ kind: "row", record: r });
    }
    return out;
  }, [rows, groupField]);

  const itemIndexByRecordId = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item, index) => {
      if (item.kind === "row") map.set(item.record.id, index);
    });
    return map;
  }, [items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (items[i].kind === "group" ? 34 : rowH),
    overscan: 12,
  });

  const activeCell = selection?.focus ?? null;
  const selectedKeys = useMemo(() => {
    if (!selection) return new Set<string>();
    return new Set(cellsInRange(selection).map(cellKey));
  }, [selection]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    pasteStateRef.current = { activeCell, editing, rows, visibleFields };
  }, [activeCell, editing, rows, visibleFields]);

  useEffect(() => {
    if (!activeCell) return;
    const record = rows[activeCell.row];
    const itemIndex = record ? itemIndexByRecordId.get(record.id) : undefined;
    if (itemIndex !== undefined) virtualizer.scrollToIndex(itemIndex, { align: "auto" });
  }, [activeCell, itemIndexByRecordId, rows, virtualizer]);

  const applyPatches = useCallback(async (patches: CellPatch[], trackHistory = true) => {
    if (patches.length === 0) return;
    if (trackHistory) setHistory((prev) => pushHistory(prev, patches));
    await commitCells(patches);
  }, [commitCells]);

  const commitOne = useCallback((record: RecordDTO, field: FieldDTO, value: unknown) => {
    void applyPatches([{
      recordId: record.id,
      fieldId: field.id,
      value,
      previousValue: record.cells[field.id],
    }]);
  }, [applyPatches]);

  const copySelection = useCallback(async () => {
    if (!selection) return;
    const { rowStart, rowEnd, colStart, colEnd } = rangeBounds(selection);
    const matrix: unknown[][] = [];
    for (let row = rowStart; row <= rowEnd; row++) {
      const record = rows[row];
      if (!record) continue;
      const values: unknown[] = [];
      for (let col = colStart; col <= colEnd; col++) {
        const field = visibleFields[col];
        values.push(field ? valueForClipboard(field, record, fields) : "");
      }
      matrix.push(values);
    }
    await navigator.clipboard.writeText(matrixToClipboardText(matrix));
    setNotice(`Copied ${matrix.length} row${matrix.length === 1 ? "" : "s"}`);
  }, [fields, rows, selection, visibleFields]);

  const clearSelection = useCallback(() => {
    if (!selection) return;
    const patches = cellsInRange(selection)
      .map((cell): CellPatch | null => {
        const record = rows[cell.row];
        const field = visibleFields[cell.col];
        if (!record || !field || isComputed(field.type) || field.type === "link") return null;
        return { recordId: record.id, fieldId: field.id, value: null, previousValue: record.cells[field.id] };
      })
      .filter(Boolean) as CellPatch[];
    void applyPatches(patches);
  }, [applyPatches, rows, selection, visibleFields]);

  const moveSelection = useCallback((direction: Parameters<typeof selectionAfterMove>[1], extend: boolean) => {
    setEditing(null);
    setSelection((cur) => selectionAfterMove(cur, direction, rows.length, visibleFields.length, extend));
  }, [rows.length, visibleFields.length]);

  const startActiveEdit = useCallback(() => {
    if (!activeCell) return;
    const record = rows[activeCell.row];
    const field = visibleFields[activeCell.col];
    if (!record || !field) return;
    if (isComputed(field.type)) {
      const el = parentRef.current?.querySelector<HTMLElement>(`[data-cell="${cellKey(activeCell)}"]`);
      const rect = el?.getBoundingClientRect();
      if (rect) setViewing({ recordId: record.id, fieldId: field.id, rect });
      return;
    }
    setEditing({ recordId: record.id, fieldId: field.id });
  }, [activeCell, rows, visibleFields]);

  const runUndo = useCallback(() => {
    const next = undoHistory(history);
    setHistory(next.history);
    void applyPatches(next.patches, false);
  }, [applyPatches, history]);

  const runRedo = useCallback(() => {
    const next = redoHistory(history);
    setHistory(next.history);
    void applyPatches(next.patches, false);
  }, [applyPatches, history]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      void copySelection();
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) runRedo();
      else runUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      runRedo();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      moveSelection(e.shiftKey ? "prev" : "next", false);
      return;
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key.replace("Arrow", "").toLowerCase() as "up" | "down" | "left" | "right";
      moveSelection(dir, e.shiftKey);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      startActiveEdit();
      return;
    }
    if (e.key === "Escape") {
      setEditing(null);
      setViewing(null);
      if (selection) setSelection({ anchor: selection.focus, focus: selection.focus });
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      clearSelection();
    }
  }, [clearSelection, copySelection, editing, moveSelection, runRedo, runUndo, selection, startActiveEdit]);

  const pasteText = useCallback((text: string): boolean => {
    const state = pasteStateRef.current;
    if (state.editing || !state.activeCell || !text) return false;
    const matrix = parseClipboardMatrix(text);
    const plan = createPastePlan(matrix, state.activeCell, state.rows, state.visibleFields);
    if (plan.errors.length) {
      setNotice(`Paste blocked: ${plan.errors[0].message}`);
      return true;
    }
    const end = {
      row: Math.min(state.activeCell.row + matrix.length - 1, Math.max(state.rows.length - 1, 0)),
      col: Math.min(state.activeCell.col + (matrix[0]?.length ?? 1) - 1, Math.max(state.visibleFields.length - 1, 0)),
    };
    setSelection({ anchor: state.activeCell, focus: end });
    setNotice(`Paste preview passed: ${plan.patches.length} cell${plan.patches.length === 1 ? "" : "s"} updated`);
    void applyPatches(plan.patches);
    return true;
  }, [applyPatches]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const onPaste = (event: ClipboardEvent) => {
      if (pasteText(event.clipboardData?.getData("text/plain") ?? "")) event.preventDefault();
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, [pasteText]);

  const startResize = useCallback((e: React.MouseEvent, field: FieldDTO) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidth(field);
    const startWidths = config.fieldWidths ?? {};
    const move = (event: MouseEvent) => {
      const nextWidth = Math.max(96, Math.round(startWidth + event.clientX - startX));
      updateConfig({ fieldWidths: { ...startWidths, [field.id]: nextWidth } });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }, [colWidth, config.fieldWidths, updateConfig]);

  return (
    <div
      ref={parentRef}
      data-testid="grid-view"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseDown={() => parentRef.current?.focus()}
      className="thin-scroll h-full min-h-0 overflow-auto bg-background outline-none"
    >
      <div style={{ width: totalWidth }} className="relative">
        {viewQueryWarning && (
          <div className="sticky top-0 z-30 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {viewQueryWarning}
          </div>
        )}
        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b border-border-token bg-surface" style={{ height: HEADER_H }}>
          <div className="flex items-center justify-center border-r border-border-token text-xs text-muted" style={{ width: GUTTER_W }}>#</div>
          {visibleFields.map((f, colIndex) => {
            const meta = FIELD_TYPE_META[f.type];
            return (
              <div key={f.id} data-field-id={f.id} className="relative flex items-center gap-1 border-r border-border-token px-2 text-sm font-medium" style={{ width: colWidth(f) }}>
                <span className="truncate" title={`${f.name} · ${meta.label}`}>{f.name}</span>
                {isComputed(f.type) && <span className="text-[10px] uppercase text-muted">fx</span>}
                <span className="ml-auto"><FieldHeaderMenu field={f} /></span>
                <button
                  aria-label={`Resize ${f.name}`}
                  title="Resize column"
                  onMouseDown={(e) => startResize(e, f)}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-accent"
                />
                {activeCell?.col === colIndex && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent" />
                )}
              </div>
            );
          })}
          <AddFieldButton onAdd={addField} />
        </div>

        {/* Body */}
        <div style={{ height: virtualizer.getTotalSize() }} className="relative">
          {virtualizer.getVirtualItems().map((vi) => {
            const item = items[vi.index];
            if (item.kind === "group") {
              return (
                <div key={vi.key} data-index={vi.index} ref={virtualizer.measureElement} className="absolute left-0 top-0 flex items-center gap-2 border-b border-border-token bg-surface/80 px-3 text-sm font-medium" style={{ transform: `translateY(${vi.start}px)`, minHeight: 34, width: "100%" }}>
                  {item.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />}
                  <span>{item.label}</span>
                  <span className="text-xs text-muted">{item.count}</span>
                </div>
              );
            }
            const record = item.record;
            const rowIndex = rowIndexById.get(record.id) ?? 0;
            return (
              <div key={record.id} data-index={vi.index} ref={virtualizer.measureElement} className="group absolute left-0 top-0 flex border-b border-border-token hover:bg-surface/60" style={{ transform: `translateY(${vi.start}px)`, minHeight: rowH, maxHeight: MAX_ROW_H, width: "100%" }}>
                <div className="flex items-start justify-between border-r border-border-token px-2 pt-2 text-xs text-muted" style={{ width: GUTTER_W }}>
                  <span className="group-hover:hidden">{rowIndex + 1}</span>
                  <div className="hidden items-center gap-1.5 group-hover:flex">
                    <button onClick={() => setExpanded(record)} data-testid="row-expand" title="Expand record" className="text-muted hover:text-accent"><Maximize2 size={12} /></button>
                    <button onClick={() => deleteRecord(record.id)} title="Delete record" className="text-muted hover:text-red-600"><Trash2 size={13} /></button>
                  </div>
                </div>
                {visibleFields.map((f, colIndex) => {
                  const cell = { row: rowIndex, col: colIndex };
                  const key = cellKey(cell);
                  const value = computeCellValue(f, record, fields);
                  const isEditing = editing?.recordId === record.id && editing?.fieldId === f.id;
                  const computed = isComputed(f.type);
                  const selected = selectedKeys.has(key);
                  const active = sameCell(activeCell, cell);
                  if (f.type === "checkbox") {
                    return (
                      <div
                        key={f.id}
                        data-cell={key}
                        data-record-id={record.id}
                        data-field-id={f.id}
                        onClick={() => setSelection({ anchor: cell, focus: cell })}
                        className={
                          "flex items-start justify-center border-r border-border-token pt-2.5 " +
                          (active ? "ring-2 ring-inset ring-accent " : selected ? "bg-accent/10 " : "")
                        }
                        style={{ width: colWidth(f) }}
                      >
                        <input type="checkbox" checked={!!value} onChange={(e) => commitOne(record, f, e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={f.id}
                      data-cell={key}
                      data-record-id={record.id}
                      data-field-id={f.id}
                      onClick={(e) => {
                        if (e.shiftKey && selection) {
                          setSelection({ anchor: selection.anchor, focus: cell });
                          setEditing(null);
                          return;
                        }
                        setSelection({ anchor: cell, focus: cell });
                        if (computed) {
                          setViewing({ recordId: record.id, fieldId: f.id, rect: e.currentTarget.getBoundingClientRect() });
                        } else if (!isEditing) {
                          setEditing({ recordId: record.id, fieldId: f.id, rect: e.currentTarget.getBoundingClientRect() });
                        }
                      }}
                      className={
                        "thin-scroll flex items-start overflow-y-auto overflow-x-hidden border-r border-border-token px-2 py-1.5 text-sm " +
                        (computed ? "cursor-pointer bg-surface/40 text-muted " : "cursor-text ") +
                        (active ? "ring-2 ring-inset ring-accent " : selected ? "bg-accent/10 " : "")
                      }
                      style={{ width: colWidth(f) }}
                    >
                      {isEditing ? (
                        f.type === "link" ? (
                          <CellPopover anchorRect={editing!.rect!} onClose={() => setEditing(null)} minWidth={260}>
                            <LinkPicker
                              field={f}
                              value={(record.cells[f.id] as LinkChip[]) ?? []}
                              onChange={(chips) => setRecordLinks(record.id, f.id, chips)}
                              onClose={() => setEditing(null)}
                            />
                          </CellPopover>
                        ) : (
                          <CellEditor
                            field={f}
                            value={record.cells[f.id]}
                            anchorRect={editing?.rect}
                            onChange={(v) => commitOne(record, f, v)}
                            onCommit={(v) => { commitOne(record, f, v); setEditing(null); }}
                            onCancel={() => setEditing(null)}
                          />
                        )
                      ) : (
                        <CellDisplay field={f} value={value} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Add row */}
        <button onClick={() => addRecord()} className="flex h-9 items-center gap-1.5 border-b border-border-token px-3 text-sm text-muted hover:bg-surface" style={{ width: totalWidth }}>
          <Plus size={15} /> Add row
        </button>
        {hasMoreRecords ? (
          <button
            onClick={() => loadMoreRecords()}
            disabled={recordLoading}
            className="flex h-9 items-center justify-center border-b border-border-token text-sm text-muted hover:bg-surface disabled:opacity-50"
            style={{ width: totalWidth }}
          >
            {recordLoading ? "Loading..." : "Load more rows"}
          </button>
        ) : (
          <div className="flex h-8 items-center justify-center border-b border-border-token text-xs text-muted" style={{ width: totalWidth }}>
            {recordTotal == null ? records.length : recordTotal} rows
          </div>
        )}
      </div>

      {notice && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border-token bg-background px-3 py-2 text-sm shadow-lg">
          {notice}
        </div>
      )}

      {/* Read-only viewer for computed cells (formula/created/updated) */}
      {viewing && (() => {
        const rec = records.find((r) => r.id === viewing.recordId);
        const fld = fields.find((f) => f.id === viewing.fieldId);
        if (!rec || !fld) return null;
        return (
          <CellPopover anchorRect={viewing.rect} onClose={() => setViewing(null)} minWidth={260}>
            <div className="p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
                {fld.name}
                {isComputed(fld.type) && <span className="rounded bg-surface px-1 text-[10px] uppercase">computed</span>}
              </div>
              <div className="thin-scroll max-h-64 overflow-auto text-sm">
                <CellDisplay field={fld} value={computeCellValue(fld, rec, fields)} expanded />
              </div>
            </div>
          </CellPopover>
        );
      })()}
      {expanded && <RecordModal record={expanded} onClose={() => setExpanded(null)} />}
    </div>
  );
}

function AddFieldButton({ onAdd }: { onAdd: ReturnType<typeof useTable>["addField"] }) {
  return (
    <Popover
      width={280}
      align="right"
      trigger={() => (
        <button className="flex items-center justify-center gap-1 text-sm text-muted hover:bg-background" style={{ width: ADD_COL_W }} title="Add field">
          <Plus size={15} /> Field
        </button>
      )}
    >
      {(close) => (
        <FieldEditor onSave={(d) => onAdd(d.name, d.type, d.options)} onClose={close} />
      )}
    </Popover>
  );
}
