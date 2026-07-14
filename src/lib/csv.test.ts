import { describe, expect, it } from "vitest";

import { parseCsv, stringifyCsv } from "@/lib/csv";

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

  it("rejects duplicate headers before import planning", () => {
    expect(() => parseCsv("Name,name\nA,B")).toThrow('Duplicate CSV header "name"');
  });

  it("stringifies escaped CSV output", () => {
    expect(stringifyCsv(["Name", "Notes"], [{ Name: "Alpha", Notes: "hello, world" }]))
      .toBe("Name,Notes\nAlpha,\"hello, world\"");
  });
});
