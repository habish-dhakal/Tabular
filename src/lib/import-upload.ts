export const CSV_UPLOAD_MAX_BYTES = 5_000_000;

const CSV_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

export interface CsvUploadCandidate {
  name: string;
  size: number;
  type?: string | null;
}

export function validateCsvUploadCandidate(file: CsvUploadCandidate): string | null {
  const name = file.name.trim();
  if (!name) return "Choose a CSV file.";
  if (file.size <= 0) return "The selected CSV file is empty.";
  if (file.size > CSV_UPLOAD_MAX_BYTES) {
    return `CSV files must be ${formatCsvUploadSize(CSV_UPLOAD_MAX_BYTES)} or smaller.`;
  }

  const lowerName = name.toLowerCase();
  const mime = (file.type ?? "").toLowerCase();
  const hasCsvExtension = lowerName.endsWith(".csv");
  const hasCsvMime = CSV_MIME_TYPES.has(mime);
  if (!hasCsvExtension && !hasCsvMime) return "Only CSV files can be imported here.";

  return null;
}

export function formatCsvUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
