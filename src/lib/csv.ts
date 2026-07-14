export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const matrix = parseCsvMatrix(text);
  if (matrix.length === 0) throw new Error("CSV is empty");
  const headers = uniqueCsvHeaders(matrix[0]);

  const rows = matrix.slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  return { headers, rows };
}

export function uniqueCsvHeaders(rawHeaders: string[]): string[] {
  const trimmed = rawHeaders.map((header) => header.trim());
  if (trimmed.length === 0 || trimmed.every((header) => !header)) throw new Error("CSV needs a header row");

  const claimed = new Set<string>();
  const sourceCounts = new Map<string, number>();
  return trimmed.map((header) => {
    if (!header) throw new Error("CSV headers cannot be blank");

    const sourceKey = header.toLowerCase();
    const sourceCount = (sourceCounts.get(sourceKey) ?? 0) + 1;
    sourceCounts.set(sourceKey, sourceCount);

    let suffix = sourceCount;
    let candidate = sourceCount === 1 ? header : `${header} (${sourceCount})`;
    while (claimed.has(candidate.toLowerCase())) {
      suffix += 1;
      candidate = `${header} (${suffix})`;
    }
    claimed.add(candidate.toLowerCase());
    return candidate;
  });
}

function parseCsvMatrix(text: string): string[][] {
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
    if (!quoted && ch === ",") {
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

  if (quoted) throw new Error("CSV has an unclosed quoted value");
  rows[rows.length - 1].push(cell);
  while (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop();
  return rows;
}

export function stringifyCsv(headers: string[], rows: Record<string, unknown>[]): string {
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ].join("\n");
}

export function stringifyCsvMatrix(headers: string[], rows: unknown[][]): string {
  return [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map(escapeCsvCell).join(",")),
  ].join("\n");
}

function escapeCsvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
