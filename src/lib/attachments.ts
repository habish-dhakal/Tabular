export interface AttachmentMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  storageKey?: string;
  checksum?: string;
  scanStatus?: "pending" | "clean" | "blocked";
}

function matchesAllowedType(type: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  return allowed.some((pattern) => {
    if (pattern.endsWith("/*")) return type.startsWith(pattern.slice(0, -1));
    return pattern === type;
  });
}

export function normalizeAttachmentValue(
  value: unknown,
  options: Record<string, unknown> = {}
): AttachmentMetadata[] {
  const rawItems = Array.isArray(value) ? value : [value];
  const maxSizeMB = Number(options.maxSizeMB ?? 25);
  const maxBytes = Math.max(1, maxSizeMB) * 1024 * 1024;
  const allowedTypes = Array.isArray(options.allowedMimeTypes)
    ? options.allowedMimeTypes.map(String).filter(Boolean)
    : [];

  return rawItems.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Attachment metadata is required");
    const raw = item as Record<string, unknown>;
    const name = String(raw.name ?? "").trim();
    const type = String(raw.type ?? "").trim();
    const size = Number(raw.size);
    const id = String(raw.id ?? raw.storageKey ?? raw.url ?? name).trim();

    if (!id) throw new Error("Attachment id is required");
    if (!name) throw new Error("Attachment name is required");
    if (!type) throw new Error("Attachment MIME type is required");
    if (!Number.isFinite(size) || size < 0) throw new Error("Attachment size is invalid");
    if (size > maxBytes) throw new Error(`Attachment "${name}" exceeds ${maxSizeMB} MB`);
    if (!matchesAllowedType(type, allowedTypes)) throw new Error(`Attachment "${name}" type is not allowed`);
    if (raw.scanStatus === "blocked") throw new Error(`Attachment "${name}" failed virus scan`);

    return {
      id,
      name,
      size,
      type,
      url: raw.url ? String(raw.url) : undefined,
      storageKey: raw.storageKey ? String(raw.storageKey) : undefined,
      checksum: raw.checksum ? String(raw.checksum) : undefined,
      scanStatus: raw.scanStatus === "pending" || raw.scanStatus === "clean" ? raw.scanStatus : undefined,
    };
  });
}
