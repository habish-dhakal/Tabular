import { describe, expect, it } from "vitest";

import { parseCsv, stringifyCsv, stringifyCsvMatrix } from "@/lib/csv";

describe("csv helpers", () => {
  it("parses quoted cells, commas, and newlines", () => {
    expect(parseCsv("Name,Notes\nAlpha,\"hello, world\"\nBeta,\"line 1\nline 2\"")).toEqual({
      headers: ["Name", "Notes"],
      rows: [
        { Name: "Alpha", Notes: "hello, world" },
        { Name: "Beta", Notes: "line 1\nline 2" },
      ],
    });
  });

  it("disambiguates duplicate Airtable headers without losing column values", () => {
    expect(parseCsv("Name,name,Name (2)\nA,B,C")).toEqual({
      headers: ["Name", "name (2)", "Name (2) (2)"],
      rows: [{ Name: "A", "name (2)": "B", "Name (2) (2)": "C" }],
    });
  });

  it("stringifies escaped CSV output", () => {
    expect(stringifyCsv(["Name", "Notes"], [{ Name: "Alpha", Notes: "hello, world" }]))
      .toBe("Name,Notes\nAlpha,\"hello, world\"");
  });

  it("stringifies duplicate headers from positional rows", () => {
    expect(stringifyCsvMatrix(["Name", "Name"], [["First", "Second"]])).toBe("Name,Name\nFirst,Second");
  });
});
