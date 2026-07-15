import { isComputed } from "@/lib/fields";
import type { FieldDTO, RecordDTO } from "@/lib/types";
import { normalizeFieldValue, ValueResolver } from "@/lib/value-resolver";

export interface GridCell {
  row: number;
  col: number;
}

export interface GridRange {
  anchor: GridCell;
  focus: GridCell;
}

export type GridDirection = "up" | "down" | "left" | "right" | "next" | "prev";

export interface CellPatch {
  recordId: string;
  fieldId: string;
  value: unknown;
  previousValue: unknown;
}

export interface PasteError {
  row: number;
  col: number;
  message: string;
}

export interface PastePlan {
  patches: CellPatch[];
  errors: PasteError[];
}

export interface GridHistory {
  undo: CellPatch[][];
  redo: CellPatch[][];
}

export const EMPTY_HISTORY: GridHistory = { undo: [], redo: [] };

export function sameCell(a: GridCell | null | undefined, b: GridCell | null | undefined): boolean {
  return !!a && !!b && a.row === b.row && a.col === b.col;
}

export function clampCell(cell: GridCell, rowCount: number, colCount: number): GridCell {
  return {
    row: Math.min(Math.max(cell.row, 0), Math.max(rowCount - 1, 0)),
    col: Math.min(Math.max(cell.col, 0), Math.max(colCount - 1, 0)),
  };
}

export function moveCell(
  cell: GridCell,
  direction: GridDirection,
  rowCount: number,
  colCount: number
): GridCell {
  const next = { ...cell };
  if (direction === "up") next.row -= 1;
  if (direction === "down") next.row += 1;
  if (direction === "left") next.col -= 1;
  if (direction === "right") next.col += 1;
  if (direction === "next") {
    if (cell.row === rowCount - 1 && cell.col === colCount - 1) return clampCell(cell, rowCount, colCount);
    next.col += 1;
    if (next.col >= colCount) {
      next.col = 0;
      next.row += 1;
    }
  }
  if (direction === "prev") {
    if (cell.row === 0 && cell.col === 0) return clampCell(cell, rowCount, colCount);
    next.col -= 1;
    if (next.col < 0) {
      next.col = colCount - 1;
      next.row -= 1;
    }
  }
  return clampCell(next, rowCount, colCount);
}

export function rangeBounds(range: GridRange) {
  return {
    rowStart: Math.min(range.anchor.row, range.focus.row),
    rowEnd: Math.max(range.anchor.row, range.focus.row),
    colStart: Math.min(range.anchor.col, range.focus.col),
    colEnd: Math.max(range.anchor.col, range.focus.col),
  };
}

export function cellsInRange(range: GridRange): GridCell[] {
  const { rowStart, rowEnd, colStart, colEnd } = rangeBounds(range);
  const cells: GridCell[] = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) cells.push({ row, col });
  }
  return cells;
}

export function selectionAfterMove(
  current: GridRange | null,
  direction: GridDirection,
  rowCount: number,
  colCount: number,
  extend: boolean
): GridRange {
  const base = current?.focus ?? { row: 0, col: 0 };
  const focus = moveCell(base, direction, rowCount, colCount);
  return { anchor: extend && current ? current.anchor : focus, focus };
}

export function parseClipboardMatrix(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        i++;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && ch === "\t") {
      rows[rows.length - 1].push(cell);
      cell = "";
      continue;
    }
    if (!quoted && (ch === "\n" || ch === "\r")) {
      rows[rows.length - 1].push(cell);
      cell = "";
      if (ch === "\r" && next === "\n") i++;
      rows.push([]);
      continue;
    }
    cell += ch;
  }

  rows[rows.length - 1].push(cell);
  while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

export function matrixToClipboardText(matrix: unknown[][]): string {
  return matrix
    .map((row) =>
      row
        .map((value) => {
          const s = value === null || value === undefined ? "" : String(value);
          return /["\t\r\n]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s;
        })
        .join("\t")
    )
    .join("\n");
}

export function valueForClipboard(field: FieldDTO, record: RecordDTO, fields: FieldDTO[]): unknown {
  const value = new ValueResolver(fields).resolveField(field, record, "export");
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * Clipboard cells are plain strings; multi-value fields are exported as a
 * comma-joined list (see valueForClipboard). Split those back into an array so
 * normalizeFieldValue can resolve each entry.
 */
function splitPasteInput(field: FieldDTO, raw: string): string | string[] {
  const isMulti =
    field.type === "multiSelect" || (field.type === "user" && field.options.allowMultiple === true);
  if (!isMulti) return raw;
  return raw.split(",").map((part) => part.trim()).filter(Boolean);
}

export function createPastePlan(
  matrix: string[][],
  start: GridCell,
  records: RecordDTO[],
  fields: FieldDTO[]
): PastePlan {
  const patches: CellPatch[] = [];
  const errors: PasteError[] = [];

  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      const row = start.row + r;
      const col = start.col + c;
      const record = records[row];
      const field = fields[col];
      if (!record || !field) continue;
      // Skip read-only (computed/link) columns instead of aborting the whole
      // paste — mirrors range-clear, and lets multi-column blocks paste over a
      // grid that happens to contain a formula/link column.
      if (isComputed(field.type) || field.type === "link") continue;
      try {
        const raw = matrix[r][c];
        const value = raw === "" ? null : normalizeFieldValue(field.type, splitPasteInput(field, raw), field.options);
        patches.push({ recordId: record.id, fieldId: field.id, value, previousValue: record.cells[field.id] });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid value";
        errors.push({ row, col, message: `"${field.name}": ${message}` });
      }
    }
  }

  return { patches: errors.length ? [] : patches, errors };
}

export function pushHistory(history: GridHistory, patches: CellPatch[]): GridHistory {
  if (patches.length === 0) return history;
  return { undo: [...history.undo, patches], redo: [] };
}

export function invertPatches(patches: CellPatch[]): CellPatch[] {
  return patches.map((patch) => ({
    recordId: patch.recordId,
    fieldId: patch.fieldId,
    value: patch.previousValue,
    previousValue: patch.value,
  }));
}

export function undoHistory(history: GridHistory): { history: GridHistory; patches: CellPatch[] } {
  const last = history.undo.at(-1);
  if (!last) return { history, patches: [] };
  return {
    patches: invertPatches(last),
    history: { undo: history.undo.slice(0, -1), redo: [...history.redo, last] },
  };
}

export function redoHistory(history: GridHistory): { history: GridHistory; patches: CellPatch[] } {
  const next = history.redo.at(-1);
  if (!next) return { history, patches: [] };
  return {
    patches: next,
    history: { undo: [...history.undo, next], redo: history.redo.slice(0, -1) },
  };
}
