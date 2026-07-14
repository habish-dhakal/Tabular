import { describe, expect, it } from "vitest";

import {
  decodeViewCursor,
  encodeViewCursor,
  normalizeViewLimit,
  visibleFieldsForView,
} from "@/lib/view-query";
import type { FieldDTO } from "@/lib/types";

const field = (id: string, name = id, position = 0): FieldDTO => ({
  id,
  name,
  tableId: "tbl",
  type: "singleLineText",
  options: {},
  position,
  isPrimary: false,
});

describe("view query helpers", () => {
  it("orders and projects visible fields from view config", () => {
    const fields = [field("a", "A", 0), field("b", "B", 1), field("c", "C", 2)];

    expect(visibleFieldsForView(fields, { fieldOrder: ["c", "a"], hiddenFieldIds: ["b"] }).map((f) => f.id))
      .toEqual(["c", "a"]);
  });

  it("bounds page sizes", () => {
    expect(normalizeViewLimit(undefined)).toBe(500);
    expect(normalizeViewLimit(100_000)).toBe(2_000);
    expect(normalizeViewLimit(10, true)).toBe(5_000);
  });

  it("round-trips cursor tokens", () => {
    const position = { kind: "position" as const, position: 12.5, id: "rec_1:two" };
    const offset = { kind: "offset" as const, offset: 40 };

    expect(decodeViewCursor(encodeViewCursor(position))).toEqual(position);
    expect(decodeViewCursor(encodeViewCursor(offset))).toEqual(offset);
    expect(decodeViewCursor("bad")).toBeNull();
  });
});
