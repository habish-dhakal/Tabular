import { describe, expect, it } from "vitest";

import {
  EMPTY_HISTORY,
  cellsInRange,
  createPastePlan,
  matrixToClipboardText,
  moveCell,
  parseClipboardMatrix,
  pushHistory,
  redoHistory,
  selectionAfterMove,
  undoHistory,
} from "@/lib/grid-state";
import type { FieldDTO, RecordDTO } from "@/lib/types";

const field = (
  id: string,
  name: string,
  type: FieldDTO["type"],
  options: Record<string, unknown> = {}
): FieldDTO => ({ id, tableId: "tbl_1", name, type, options, position: 0, isPrimary: false });

const record = (id: string, cells: Record<string, unknown> = {}, position = 0): RecordDTO => ({
  id,
  tableId: "tbl_1",
  cells,
  position,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("grid navigation state", () => {
  it("moves with arrows, tab, and shift-tab inside grid bounds", () => {
    expect(moveCell({ row: 1, col: 1 }, "up", 3, 3)).toEqual({ row: 0, col: 1 });
    expect(moveCell({ row: 1, col: 1 }, "right", 3, 3)).toEqual({ row: 1, col: 2 });
    expect(moveCell({ row: 0, col: 2 }, "next", 3, 3)).toEqual({ row: 1, col: 0 });
    expect(moveCell({ row: 1, col: 0 }, "prev", 3, 3)).toEqual({ row: 0, col: 2 });
    expect(moveCell({ row: 0, col: 0 }, "prev", 3, 3)).toEqual({ row: 0, col: 0 });
  });

  it("extends a selected range from the anchor when shift-moving", () => {
    const first = { anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } };
    const range = selectionAfterMove(first, "down", 4, 4, true);

    expect(range).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 2, col: 1 } });
    expect(cellsInRange(range)).toEqual([{ row: 1, col: 1 }, { row: 2, col: 1 }]);
  });
});

describe("clipboard matrix helpers", () => {
  it("parses pasted spreadsheet text with quoted tabs and newlines", () => {
    expect(parseClipboardMatrix("A\t\"B\tC\"\n\"D\nE\"\tF\n")).toEqual([
      ["A", "B\tC"],
      ["D\nE", "F"],
    ]);
  });

  it("serializes values back to spreadsheet text", () => {
    expect(matrixToClipboardText([["A", "B\tC"], ["D\nE", "F"]])).toBe("A\t\"B\tC\"\n\"D\nE\"\tF");
  });
});

describe("paste planning", () => {
  it("validates a matrix before returning writable patches", () => {
    const fields = [field("name", "Name", "singleLineText"), field("score", "Score", "number")];
    const rows = [record("r1"), record("r2")];

    expect(createPastePlan([["Alpha", "10"], ["Beta", "20"]], { row: 0, col: 0 }, rows, fields)).toEqual({
      errors: [],
      patches: [
        { recordId: "r1", fieldId: "name", value: "Alpha", previousValue: undefined },
        { recordId: "r1", fieldId: "score", value: 10, previousValue: undefined },
        { recordId: "r2", fieldId: "name", value: "Beta", previousValue: undefined },
        { recordId: "r2", fieldId: "score", value: 20, previousValue: undefined },
      ],
    });
  });

  it("blocks the whole paste plan when any pasted value is invalid", () => {
    const fields = [field("name", "Name", "singleLineText"), field("score", "Score", "number")];
    const rows = [record("r1"), record("r2")];
    const plan = createPastePlan([["Alpha", "nope"], ["Beta", "20"]], { row: 0, col: 0 }, rows, fields);

    expect(plan.patches).toEqual([]);
    expect(plan.errors).toEqual([{ row: 0, col: 1, message: "\"Score\": Not a number" }]);
  });

  it("round-trips select values pasted as their display names", () => {
    const status = field("status", "Status", "singleSelect", {
      choices: [{ id: "c_todo", name: "Todo" }, { id: "c_done", name: "Done" }],
    });
    const tags = field("tags", "Tags", "multiSelect", {
      choices: [{ id: "t_a", name: "A" }, { id: "t_b", name: "B" }],
    });
    const rows = [record("r1")];
    const plan = createPastePlan([["Done", "A, B"]], { row: 0, col: 0 }, rows, [status, tags]);

    expect(plan.errors).toEqual([]);
    expect(plan.patches).toEqual([
      { recordId: "r1", fieldId: "status", value: "c_done", previousValue: undefined },
      { recordId: "r1", fieldId: "tags", value: ["t_a", "t_b"], previousValue: undefined },
    ]);
  });

  it("skips computed/link columns instead of blocking the whole paste", () => {
    const fields = [
      field("name", "Name", "singleLineText"),
      field("formula", "Calc", "formula", { expression: "1" }),
    ];
    const rows = [record("r1")];
    const plan = createPastePlan([["Alpha", "ignored"]], { row: 0, col: 0 }, rows, fields);

    expect(plan.errors).toEqual([]);
    expect(plan.patches).toEqual([
      { recordId: "r1", fieldId: "name", value: "Alpha", previousValue: undefined },
    ]);
  });
});

describe("grid edit history", () => {
  it("returns inverse patches for undo and original patches for redo", () => {
    const patch = { recordId: "r1", fieldId: "name", value: "After", previousValue: "Before" };
    const withEdit = pushHistory(EMPTY_HISTORY, [patch]);
    const undone = undoHistory(withEdit);
    const redone = redoHistory(undone.history);

    expect(undone.patches).toEqual([{ recordId: "r1", fieldId: "name", value: "Before", previousValue: "After" }]);
    expect(redone.patches).toEqual([patch]);
  });
});
