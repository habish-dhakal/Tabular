"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus, Trash2 } from "lucide-react";
import { useTable } from "@/components/table/TableProvider";
import { FieldHeaderMenu } from "@/components/table/FieldHeaderMenu";
import { FieldEditor } from "@/components/table/FieldEditor";
import { Popover } from "@/components/ui/Popover";
import { CellPopover } from "@/components/cell-editors/CellPopover";
import { CellDisplay, CellEditor } from "@/components/Cell";
import { FIELD_TYPE_META, isComputed, type SelectChoice } from "@/lib/fields";
import { applyFilterSort, groupRecords } from "@/lib/query";
import { computeCellValue } from "@/lib/compute";
import type { FieldDTO, RecordDTO } from "@/lib/types";

const GUTTER_W = 56;
const DEFAULT_COL_W = 180;
const PRIMARY_COL_W = 240;
const ADD_COL_W = 120;
const ROW_HEIGHTS = { short: 36, medium: 48, tall: 68 } as const;
const HEADER_H = 32;

type Item =
  | { kind: "group"; key: string; label: string; color?: string; count: number }
  | { kind: "row"; record: RecordDTO };

export function GridView() {
  const {
    fields, records, config, commitCell, addRecord, deleteRecord, addField,
  } = useTable();
  const parentRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ recordId: string; fieldId: string; rect?: DOMRect } | null>(null);
  const [viewing, setViewing] = useState<{ recordId: string; fieldId: string; rect: DOMRect } | null>(null);

  const rowH = ROW_HEIGHTS[config.rowHeight ?? "short"];
  const hidden = new Set(config.hiddenFieldIds ?? []);
  const visibleFields = fields.filter((f) => !hidden.has(f.id));
  const colWidth = (f: FieldDTO) => (f.isPrimary ? PRIMARY_COL_W : DEFAULT_COL_W);
  const totalWidth =
    GUTTER_W + visibleFields.reduce((s, f) => s + colWidth(f), 0) + ADD_COL_W;

  const groupField = config.groupBy ? fields.find((f) => f.id === config.groupBy) : undefined;

  const items = useMemo<Item[]>(() => {
    const rows = applyFilterSort(records, fields, config);
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
  }, [records, fields, config, groupField]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (items[i].kind === "group" ? 34 : rowH),
    overscan: 12,
  });

  return (
    <div ref={parentRef} className="thin-scroll h-full overflow-auto bg-background">
      <div style={{ width: totalWidth }} className="relative">
        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b border-border-token bg-surface" style={{ height: HEADER_H }}>
          <div className="flex items-center justify-center border-r border-border-token text-xs text-muted" style={{ width: GUTTER_W }}>#</div>
          {visibleFields.map((f) => {
            const meta = FIELD_TYPE_META[f.type];
            return (
              <div key={f.id} className="flex items-center gap-1 border-r border-border-token px-2 text-sm font-medium" style={{ width: colWidth(f) }}>
                <span className="truncate" title={`${f.name} · ${meta.label}`}>{f.name}</span>
                {isComputed(f.type) && <span className="text-[10px] uppercase text-muted">fx</span>}
                <span className="ml-auto"><FieldHeaderMenu field={f} /></span>
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
                <div key={vi.key} className="absolute left-0 flex items-center gap-2 border-b border-border-token bg-surface/80 px-3 text-sm font-medium" style={{ top: vi.start, height: 34, width: "100%" }}>
                  {item.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />}
                  <span>{item.label}</span>
                  <span className="text-xs text-muted">{item.count}</span>
                </div>
              );
            }
            const record = item.record;
            return (
              <div key={record.id} className="group absolute left-0 flex border-b border-border-token hover:bg-surface/60" style={{ top: vi.start, height: rowH, width: "100%" }}>
                <div className="flex items-center justify-between border-r border-border-token px-2 text-xs text-muted" style={{ width: GUTTER_W }}>
                  <span className="group-hover:hidden">{vi.index + 1}</span>
                  <button onClick={() => deleteRecord(record.id)} className="hidden text-muted hover:text-red-600 group-hover:block"><Trash2 size={13} /></button>
                </div>
                {visibleFields.map((f) => {
                  const value = computeCellValue(f, record, fields);
                  const isEditing = editing?.recordId === record.id && editing?.fieldId === f.id;
                  const computed = isComputed(f.type);
                  if (f.type === "checkbox") {
                    return (
                      <div key={f.id} className="flex items-center justify-center border-r border-border-token" style={{ width: colWidth(f) }}>
                        <input type="checkbox" checked={!!value} onChange={(e) => commitCell(record.id, f.id, e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={f.id}
                      onClick={(e) =>
                        computed
                          ? setViewing({ recordId: record.id, fieldId: f.id, rect: e.currentTarget.getBoundingClientRect() })
                          : !isEditing && setEditing({ recordId: record.id, fieldId: f.id, rect: e.currentTarget.getBoundingClientRect() })
                      }
                      className={"flex items-center overflow-hidden border-r border-border-token px-2 text-sm " + (computed ? "cursor-pointer bg-surface/40 text-muted" : "cursor-text")}
                      style={{ width: colWidth(f) }}
                    >
                      {isEditing ? (
                        <CellEditor field={f} value={record.cells[f.id]} anchorRect={editing?.rect} onChange={(v) => commitCell(record.id, f.id, v)} onCommit={(v) => { commitCell(record.id, f.id, v); setEditing(null); }} onCancel={() => setEditing(null)} />
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
      </div>

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
