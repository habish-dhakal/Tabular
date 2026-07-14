import type { FieldDTO, RecordDTO, ViewConfig } from "@/lib/types";

export const DEFAULT_VIEW_PAGE_SIZE = 500;
export const MAX_VIEW_PAGE_SIZE = 2_000;
export const LOAD_ALL_VIEW_LIMIT = 5_000;
export const MATERIALIZED_VIEW_SCAN_LIMIT = 20_000;

export type ViewQueryMode = "keyset" | "offset" | "materialized";

export interface PositionCursor {
  kind: "position";
  position: number;
  id: string;
}

export interface OffsetCursor {
  kind: "offset";
  offset: number;
}

export type ViewCursor = PositionCursor | OffsetCursor;

export interface ViewGroupSummary {
  key: string;
  label: string;
  count: number;
  color?: string;
}

export interface ViewRecordPage {
  records: RecordDTO[];
  total: number | null;
  loaded: number;
  hasMore: boolean;
  nextCursor: string | null;
  visibleFieldIds: string[];
  groups: ViewGroupSummary[];
  mode: ViewQueryMode;
  search: string;
  warning?: string;
}

export function normalizeViewLimit(limit: unknown, loadAll = false): number {
  if (loadAll) return LOAD_ALL_VIEW_LIMIT;
  const parsed = Number(limit ?? DEFAULT_VIEW_PAGE_SIZE);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_VIEW_PAGE_SIZE;
  return Math.min(Math.floor(parsed), MAX_VIEW_PAGE_SIZE);
}

export function normalizeViewSearch(search: unknown): string {
  return String(search ?? "").trim().slice(0, 200);
}

export function encodeViewCursor(cursor: ViewCursor | null): string | null {
  if (!cursor) return null;
  if (cursor.kind === "position") return `pos:${cursor.position}:${encodeURIComponent(cursor.id)}`;
  return `off:${cursor.offset}`;
}

export function decodeViewCursor(token: string | null | undefined): ViewCursor | null {
  if (!token) return null;
  const [kind, rawNumber, rawId] = token.split(":");
  const number = Number(rawNumber);
  if (!Number.isFinite(number)) return null;
  if (kind === "pos" && rawId) return { kind: "position", position: number, id: decodeURIComponent(rawId) };
  if (kind === "off") return { kind: "offset", offset: Math.max(0, Math.floor(number)) };
  return null;
}

export function orderFieldsForView(fields: FieldDTO[], order: string[] | undefined): FieldDTO[] {
  if (!order?.length) return fields;
  const byId = new Map(fields.map((field) => [field.id, field]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as FieldDTO[];
  const seen = new Set(ordered.map((field) => field.id));
  return [...ordered, ...fields.filter((field) => !seen.has(field.id))];
}

export function visibleFieldsForView(fields: FieldDTO[], config: ViewConfig): FieldDTO[] {
  const hidden = new Set(config.hiddenFieldIds ?? []);
  return orderFieldsForView(fields, config.fieldOrder).filter((field) => !hidden.has(field.id));
}
