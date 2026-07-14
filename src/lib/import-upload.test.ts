import { describe, expect, it } from "vitest";

import {
  CSV_UPLOAD_MAX_BYTES,
  formatCsvUploadSize,
  validateCsvUploadCandidate,
} from "@/lib/import-upload";

describe("CSV upload validation", () => {
  it("accepts normal CSV files", () => {
    expect(validateCsvUploadCandidate({ name: "questionnaires.csv", size: 128, type: "text/csv" })).toBeNull();
  });

  it("accepts CSV extension when the browser omits the MIME type", () => {
    expect(validateCsvUploadCandidate({ name: "airtable-export.csv", size: 128, type: "" })).toBeNull();
  });

  it("rejects non-CSV files", () => {
    expect(validateCsvUploadCandidate({ name: "backup.json", size: 128, type: "application/json" })).toBe("Only CSV files can be imported here.");
  });

  it("rejects empty and oversized files", () => {
    expect(validateCsvUploadCandidate({ name: "empty.csv", size: 0, type: "text/csv" })).toBe("The selected CSV file is empty.");
    expect(validateCsvUploadCandidate({ name: "huge.csv", size: CSV_UPLOAD_MAX_BYTES + 1, type: "text/csv" })).toContain("or smaller");
  });

  it("formats file sizes for the UI", () => {
    expect(formatCsvUploadSize(512)).toBe("512 B");
    expect(formatCsvUploadSize(2048)).toBe("2.0 KB");
    expect(formatCsvUploadSize(5_000_000)).toBe("4.8 MB");
  });
});
