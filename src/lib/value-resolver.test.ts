import { describe, expect, it } from "vitest";

import { computeCellValue } from "@/lib/compute";
import { applyFilterSort, compareByField, evaluateCondition } from "@/lib/query";
import { ValueResolver } from "@/lib/value-resolver";
import { makeInterpolator } from "@/server/automations/interpolate";
import type { FieldDTO, RecordDTO } from "@/lib/types";

const field = (
  id: string,
  name: string,
  type: FieldDTO["type"],
  options: Record<string, unknown> = {}
): FieldDTO => ({ id, tableId: "tbl_1", name, type, options, position: 0, isPrimary: false });

const record = (
  id: string,
  cells: Record<string, unknown>,
  position = 0
): RecordDTO => ({
  id,
  tableId: "tbl_1",
  cells,
  position,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("ValueResolver", () => {
  it("uses computed formula values for filters", () => {
    const name = field("fld_name", "Name", "singleLineText");
    const upper = field("fld_upper", "Upper", "formula", { expression: "UPPER({Name})" });
    const rows = [
      record("rec_alpha", { [name.id]: "alpha" }, 0),
      record("rec_bravo", { [name.id]: "bravo" }, 1),
    ];

    const filtered = applyFilterSort(rows, [name, upper], {
      filters: {
        conjunction: "and",
        conditions: [{ id: "flt_1", fieldId: upper.id, op: "is", value: "ALPHA" }],
      },
    });

    expect(filtered.map((r) => r.id)).toEqual(["rec_alpha"]);
  });

  it("sorts lookup values by their resolved query text", () => {
    const lookup = field("fld_lookup", "Lookup", "lookup");
    const rows = [
      record("rec_beta", { [lookup.id]: ["Beta"] }, 0),
      record("rec_alpha", { [lookup.id]: ["Alpha"] }, 1),
    ];

    const sorted = applyFilterSort(rows, [lookup], {
      sorts: [{ fieldId: lookup.id, direction: "asc" }],
    });

    expect(sorted.map((r) => r.id)).toEqual(["rec_alpha", "rec_beta"]);
  });

  it("evaluates numeric rollup conditions for automation/query paths", () => {
    const rollup = field("fld_count", "Count", "rollup", { fn: "COUNT" });

    expect(evaluateCondition(rollup, 2, "gt", 1)).toBe(true);
    expect(evaluateCondition(rollup, 2, "gt", 3)).toBe(false);
  });

  it("keeps linked record query and automation token values coherent", () => {
    const link = field("fld_link", "Related", "link");
    const resolver = new ValueResolver([link]);
    const chips = [
      { id: "rec_a", label: "Alpha" },
      { id: "rec_b", label: "Beta" },
    ];
    const row = record("rec_1", { [link.id]: chips });

    expect(resolver.resolveField(link, row, "display")).toEqual(chips);
    expect(resolver.resolveField(link, row, "query")).toBe("Alpha, Beta");
    expect(resolver.resolveField(link, row, "automationToken")).toBe("Alpha, Beta");
  });

  it("uses resolver values when interpolating automation tokens", () => {
    const name = field("fld_name", "Name", "singleLineText");
    const upper = field("fld_upper", "Upper", "formula", { expression: "UPPER({Name})" });
    const link = field("fld_link", "Related", "link");
    const row = record("rec_1", {
      [name.id]: "alpha",
      [link.id]: [{ id: "rec_a", label: "Alpha target" }],
    });
    const interpolate = makeInterpolator([name, upper, link], row.cells);

    expect(interpolate("{{Upper}} -> {{Related}}")).toBe("ALPHA -> Alpha target");
  });

  it("detects formula dependency cycles and returns a safe cell error", () => {
    const a = field("fld_a", "A", "formula", { expression: "{B}" });
    const b = field("fld_b", "B", "formula", { expression: "{A}" });
    const resolver = new ValueResolver([a, b]);

    expect(resolver.detectCycles()).toEqual([["fld_a", "fld_b", "fld_a"]]);
    expect(computeCellValue(a, record("rec_1", {}), [a, b])).toBe("#CYCLE");
  });

  it("derives a stable auto-number fallback from record identity", () => {
    const auto = field("fld_auto", "No.", "autoNumber");
    const resolver = new ValueResolver([auto]);

    const first = resolver.resolveField(auto, record("rec_same", {}, 0), "computed");
    const afterReorder = resolver.resolveField(auto, record("rec_same", {}, 999), "computed");

    expect(first).toBe(afterReorder);
    expect(typeof first).toBe("number");
  });

  it("keeps compareByField wired to resolver semantics", () => {
    const lookup = field("fld_lookup", "Lookup", "lookup");

    expect(compareByField(lookup, ["Beta"], ["Alpha"])).toBeGreaterThan(0);
  });
});
