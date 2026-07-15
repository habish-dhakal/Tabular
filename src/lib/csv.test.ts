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

  it("neutralizes CSV formula injection on export", () => {
    expect(stringifyCsv(["Name"], [{ Name: "=cmd|'/c calc'!A1" }]))
      .toBe("Name\n'=cmd|'/c calc'!A1");
    // Danger char plus a comma still gets quoted after the guard.
    expect(stringifyCsv(["Name"], [{ Name: "=A1,B2" }])).toBe("Name\n\"'=A1,B2\"");
    expect(stringifyCsv(["Name"], [{ Name: "@SUM(A1)" }])).toBe("Name\n'@SUM(A1)");
    expect(stringifyCsvMatrix(["A", "B", "C"], [["+1", "-1", "@cmd"]]))
      .toBe("A,B,C\n'+1,'-1,'@cmd");
    // Ordinary values are untouched.
    expect(stringifyCsv(["Name"], [{ Name: "Alpha" }])).toBe("Name\nAlpha");
  });

  it("strips a leading UTF-8 BOM so the first header maps cleanly", () => {
    expect(parseCsv("﻿Name,Notes\nAlpha,Beta")).toEqual({
      headers: ["Name", "Notes"],
      rows: [{ Name: "Alpha", Notes: "Beta" }],
    });
  });
});
