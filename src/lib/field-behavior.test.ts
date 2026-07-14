import { describe, expect, it } from "vitest";

import {
  defaultValueForField,
  duplicateUniqueValue,
  fieldCanStoreCellValue,
  normalizeInitialCells,
  normalizePatchedCells,
  previewFieldConversion,
  validateRequiredFields,
} from "@/lib/field-behavior";
import type { FieldDTO, RecordDTO } from "@/lib/types";

const field = (
  id: string,
  name: string,
  type: FieldDTO["type"],
  options: Record<string, unknown> = {}
): FieldDTO => ({ id, tableId: "tbl_1", name, type, options, position: 0, isPrimary: false });

const record = (id: string, cells: Record<string, unknown>): RecordDTO => ({
  id,
  tableId: "tbl_1",
  cells,
  position: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("field behavior contract", () => {
  it("applies defaults through the same normalization path as writes", () => {
    const status = field("fld_status", "Status", "singleSelect", {
      defaultValue: "todo",
      choices: [{ id: "todo", name: "Todo", color: "#eab308" }],
    });

    expect(defaultValueForField(status)).toBe("todo");
    expect(normalizeInitialCells([status], {})).toEqual({ fld_status: "todo" });
  });

  it("enforces required fields against normalized cells", () => {
    const required = field("fld_name", "Name", "singleLineText", { required: true });

    expect(() => validateRequiredFields([required], {})).toThrow('Field "Name" is required');
    expect(() => validateRequiredFields([required], { fld_name: "Alpha" })).not.toThrow();
  });

  it("detects duplicate values for unique fields", () => {
    const email = field("fld_email", "Email", "email", { unique: true });

    expect(duplicateUniqueValue([record("rec_1", { fld_email: "a@b.com" })], email, "a@b.com")?.id).toBe("rec_1");
    expect(duplicateUniqueValue([record("rec_1", { fld_email: "a@b.com" })], email, "a@b.com", "rec_1")).toBeNull();
  });

  it("blocks direct writes to computed and action-only fields", () => {
    expect(fieldCanStoreCellValue(field("fld_count", "Count", "count"))).toBe(false);
    expect(fieldCanStoreCellValue(field("fld_button", "Button", "button"))).toBe(false);
    expect(() => normalizePatchedCells([field("fld_button", "Button", "button")], {}, { fld_button: "x" })).toThrow();
  });

  it("previews lossy type conversions before a field update", () => {
    const score = field("fld_score", "Score", "singleLineText");
    const preview = previewFieldConversion(
      score,
      [record("rec_ok", { fld_score: "10" }), record("rec_bad", { fld_score: "ten" })],
      "number"
    );

    expect(preview).toMatchObject({ total: 2, convertible: 1, cleared: 1 });
    expect(preview.samples[0]).toMatchObject({ recordId: "rec_bad" });
  });
});
