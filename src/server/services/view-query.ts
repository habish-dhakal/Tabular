import {
  and,
  asc,
  desc,
  eq,
  gt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { applyFilterSort, groupRecords } from "@/lib/query";
import type { FieldDTO, FilterCondition, RecordDTO, SortRule, ViewDTO } from "@/lib/types";
import { ValueResolver, isBlankValue } from "@/lib/value-resolver";
import {
  MATERIALIZED_VIEW_SCAN_LIMIT,
  decodeViewCursor,
  encodeViewCursor,
  normalizeViewLimit,
  normalizeViewSearch,
  visibleFieldsForView,
  type ViewGroupSummary,
  type ViewQueryMode,
  type ViewRecordPage,
} from "@/lib/view-query";
import { db } from "@/server/db";
import { fields, records, views } from "@/server/db/schema";
import { enrichRecords } from "@/server/services/links";
import { toRecordDTO, type RecordRow } from "@/server/services/record-dto";

interface QueryViewRecordsInput {
  limit?: number;
  cursor?: string | null;
  search?: string;
  includeTotal?: boolean;
  loadAll?: boolean;
}

type QueryPlan =
  | { kind: "db"; where: SQL | undefined; orderBy: SQL[]; mode: ViewQueryMode }
  | { kind: "materialized"; warning: string };

const SCALAR_TEXT_TYPES = new Set<FieldDTO["type"]>([
  "singleLineText",
  "longText",
  "url",
  "email",
  "phone",
  "singleSelect",
  "date",
  "dateTime",
]);
const SCALAR_NUMBER_TYPES = new Set<FieldDTO["type"]>(["number", "currency", "percent", "rating", "duration", "autoNumber"]);
const DB_FILTER_TYPES = new Set<FieldDTO["type"]>([...SCALAR_TEXT_TYPES, ...SCALAR_NUMBER_TYPES, "checkbox"]);
const MATERIALIZED_WARNING =
  "This view uses computed or relationship-heavy query rules; results are served by a bounded server-side fallback until Phase 5b indexing lands.";

export async function queryViewRecords(viewId: string, input: QueryViewRecordsInput = {}): Promise<ViewRecordPage> {
  const view = await db.query.views.findFirst({ where: eq(views.id, viewId) }) as unknown as ViewDTO | undefined;
  if (!view) throw new Error("View not found");
  const tableFields = await db.query.fields.findMany({
    where: eq(fields.tableId, view.tableId),
    orderBy: asc(fields.position),
  }) as unknown as FieldDTO[];

  const limit = normalizeViewLimit(input.limit, input.loadAll);
  const search = normalizeViewSearch(input.search ?? view.config.search);
  const visibleFields = visibleFieldsForView(tableFields, view.config);
  const plan = buildQueryPlan(view, tableFields, visibleFields, search);

  const page = plan.kind === "db"
    ? await queryDbPage(view, tableFields, visibleFields, plan, limit, input.cursor, input.includeTotal !== false, search)
    : await queryMaterializedPage(view, tableFields, visibleFields, limit, input.cursor, search, plan.warning);

  return page;
}

function buildQueryPlan(
  view: ViewDTO,
  tableFields: FieldDTO[],
  visibleFields: FieldDTO[],
  search: string
): QueryPlan {
  const fieldsById = new Map(tableFields.map((field) => [field.id, field]));
  const filterWhere = filterWhereSql(fieldsById, view.config.filters);
  if (filterWhere === null) return { kind: "materialized", warning: MATERIALIZED_WARNING };
  const searchWhere = search ? searchWhereSql(visibleFields, search) : undefined;
  if (search && searchWhere === null) return { kind: "materialized", warning: MATERIALIZED_WARNING };
  const sortPlan = sortOrderSql(fieldsById, view.config.sorts);
  if (sortPlan === null) return { kind: "materialized", warning: MATERIALIZED_WARNING };

  const where = and(eq(records.tableId, view.tableId), filterWhere ?? undefined, searchWhere ?? undefined);
  if (sortPlan.length === 0) {
    return { kind: "db", where, orderBy: [asc(records.position), asc(records.id)], mode: "keyset" };
  }
  return { kind: "db", where, orderBy: [...sortPlan, asc(records.position), asc(records.id)], mode: "offset" };
}

async function queryDbPage(
  view: ViewDTO,
  tableFields: FieldDTO[],
  visibleFields: FieldDTO[],
  plan: Extract<QueryPlan, { kind: "db" }>,
  limit: number,
  cursorToken: string | null | undefined,
  includeTotal: boolean,
  search: string
): Promise<ViewRecordPage> {
  const cursor = decodeViewCursor(cursorToken);
  const offset = plan.mode === "offset" && cursor?.kind === "offset" ? cursor.offset : 0;
  const keysetWhere = plan.mode === "keyset" && cursor?.kind === "position"
    ? or(gt(records.position, cursor.position), and(eq(records.position, cursor.position), gt(records.id, cursor.id)))
    : undefined;
  const where = and(plan.where, keysetWhere);

  const rows = await db
    .select()
    .from(records)
    .where(where)
    .orderBy(...plan.orderBy)
    .limit(limit + 1)
    .offset(offset);
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const total = includeTotal ? await countRows(plan.where) : null;
  const nextCursor = hasMore ? nextCursorFor(plan.mode, pageRows, offset + limit) : null;
  const recordsPage = await hydrateAndProject(view.tableId, pageRows, tableFields, visibleFields);
  const groups = await queryGroupSummaries(view, tableFields, plan.where);

  return {
    records: recordsPage,
    total,
    loaded: recordsPage.length,
    hasMore,
    nextCursor,
    visibleFieldIds: visibleFields.map((field) => field.id),
    groups,
    mode: plan.mode,
    search,
  };
}

async function queryMaterializedPage(
  view: ViewDTO,
  tableFields: FieldDTO[],
  visibleFields: FieldDTO[],
  limit: number,
  cursorToken: string | null | undefined,
  search: string,
  warning: string
): Promise<ViewRecordPage> {
  const cursor = decodeViewCursor(cursorToken);
  const offset = cursor?.kind === "offset" ? cursor.offset : 0;
  const raw = await db.query.records.findMany({
    where: eq(records.tableId, view.tableId),
    orderBy: asc(records.position),
    limit: MATERIALIZED_VIEW_SCAN_LIMIT,
  }) as RecordRow[];
  const hydrated = await hydrateRecords(view.tableId, raw.map(toRecordDTO));
  const searched = search ? searchRecords(hydrated, visibleFields, tableFields, search) : hydrated;
  const queried = applyFilterSort(searched, tableFields, view.config);
  const pageRows = queried.slice(offset, offset + limit);
  const groups = view.config.groupBy
    ? groupRecords(queried, tableFields.find((field) => field.id === view.config.groupBy)).map(groupToSummary)
    : [];

  return {
    records: projectRecords(pageRows, tableFields, visibleFields),
    total: queried.length,
    loaded: pageRows.length,
    hasMore: offset + limit < queried.length,
    nextCursor: offset + limit < queried.length ? encodeViewCursor({ kind: "offset", offset: offset + limit }) : null,
    visibleFieldIds: visibleFields.map((field) => field.id),
    groups,
    mode: "materialized",
    search,
    warning,
  };
}

async function countRows(where: SQL | undefined): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(records)
    .where(where);
  return result[0]?.count ?? 0;
}

function nextCursorFor(mode: ViewQueryMode, pageRows: RecordRow[], nextOffset: number): string | null {
  if (mode === "offset") return encodeViewCursor({ kind: "offset", offset: nextOffset });
  const last = pageRows[pageRows.length - 1];
  return last ? encodeViewCursor({ kind: "position", position: last.position, id: last.id }) : null;
}

async function hydrateAndProject(
  tableId: string,
  rows: RecordRow[],
  tableFields: FieldDTO[],
  visibleFields: FieldDTO[]
): Promise<RecordDTO[]> {
  return projectRecords(await hydrateRecords(tableId, rows.map(toRecordDTO)), tableFields, visibleFields);
}

async function hydrateRecords(tableId: string, recordsPage: RecordDTO[]): Promise<RecordDTO[]> {
  await enrichRecords(tableId, recordsPage as { id: string; cells: Record<string, unknown> }[]);
  return recordsPage;
}

function projectRecords(recordsPage: RecordDTO[], tableFields: FieldDTO[], visibleFields: FieldDTO[]): RecordDTO[] {
  const resolver = new ValueResolver(tableFields);
  return recordsPage.map((record) => ({
    ...record,
    cells: Object.fromEntries(
      visibleFields.map((field) => [field.id, resolver.resolveField(field, record, "computed")])
    ),
  }));
}

function searchRecords(recordsPage: RecordDTO[], visibleFields: FieldDTO[], tableFields: FieldDTO[], search: string): RecordDTO[] {
  const resolver = new ValueResolver(tableFields);
  const needle = search.toLowerCase();
  return recordsPage.filter((record) =>
    visibleFields.some((field) => String(resolver.resolveField(field, record, "query") ?? "").toLowerCase().includes(needle))
  );
}

function filterWhereSql(
  fieldsById: Map<string, FieldDTO>,
  filters: ViewDTO["config"]["filters"]
): SQL | undefined | null {
  if (!filters || filters.conditions.length === 0) return undefined;
  const parts: SQL[] = [];
  for (const condition of filters.conditions) {
    const field = fieldsById.get(condition.fieldId);
    if (!field) continue;
    const where = conditionWhereSql(field, condition);
    if (!where) return null;
    parts.push(where);
  }
  if (parts.length === 0) return undefined;
  return filters.conjunction === "or" ? or(...parts) : and(...parts);
}

function conditionWhereSql(field: FieldDTO, condition: FilterCondition): SQL | null {
  if (!DB_FILTER_TYPES.has(field.type)) return null;
  const text = cellText(field.id);
  const empty = sql`coalesce(${text}, '') = ''`;

  switch (condition.op) {
    case "isEmpty":
      return empty;
    case "isNotEmpty":
      return sql`not (${empty})`;
  }

  if (SCALAR_NUMBER_TYPES.has(field.type)) return numberConditionSql(field.id, condition);
  if (field.type === "checkbox") return booleanConditionSql(field.id, condition);
  if (field.type === "singleSelect") return selectConditionSql(field.id, condition);
  if (SCALAR_TEXT_TYPES.has(field.type)) return textConditionSql(field.id, condition);
  return null;
}

function numberConditionSql(fieldId: string, condition: FilterCondition): SQL | null {
  const value = Number(condition.value);
  if (!Number.isFinite(value)) return null;
  const number = cellNumber(fieldId);
  switch (condition.op) {
    case "eq": return sql`${number} = ${value}`;
    case "neq": return sql`${number} <> ${value}`;
    case "lt": return sql`${number} < ${value}`;
    case "lte": return sql`${number} <= ${value}`;
    case "gt": return sql`${number} > ${value}`;
    case "gte": return sql`${number} >= ${value}`;
    case "is": return sql`${number} = ${value}`;
    case "isNot": return sql`${number} <> ${value}`;
    default: return null;
  }
}

function booleanConditionSql(fieldId: string, condition: FilterCondition): SQL | null {
  if (condition.op !== "is") return null;
  const expected = condition.value === true || String(condition.value).toLowerCase() === "true";
  return sql`coalesce(${cellText(fieldId)}, 'false') = ${String(expected)}`;
}

function selectConditionSql(fieldId: string, condition: FilterCondition): SQL | null {
  const text = cellText(fieldId);
  switch (condition.op) {
    case "is":
      return sql`${text} = ${String(condition.value ?? "")}`;
    case "isNot":
      return sql`coalesce(${text}, '') <> ${String(condition.value ?? "")}`;
    case "isAnyOf":
      return arrayTarget(condition.value, (values) => sql`${text} = any(${values})`);
    case "isNoneOf":
      return arrayTarget(condition.value, (values) => sql`not (${text} = any(${values}))`);
    default:
      return null;
  }
}

function textConditionSql(fieldId: string, condition: FilterCondition): SQL | null {
  const text = cellText(fieldId);
  const target = String(condition.value ?? "");
  switch (condition.op) {
    case "is":
      return sql`coalesce(${text}, '') = ${target}`;
    case "isNot":
      return sql`coalesce(${text}, '') <> ${target}`;
    case "contains":
      return ilikeSql(text, target);
    case "doesNotContain":
      return sql`not (${ilikeSql(text, target)})`;
    case "isBefore":
      return sql`${text} < ${target}`;
    case "isAfter":
      return sql`${text} > ${target}`;
    case "isOnOrBefore":
      return sql`${text} <= ${target}`;
    case "isOnOrAfter":
      return sql`${text} >= ${target}`;
    default:
      return null;
  }
}

function arrayTarget(value: unknown, build: (values: string[]) => SQL): SQL | null {
  const values = Array.isArray(value) ? value.map(String) : [];
  return values.length ? build(values) : null;
}

function searchWhereSql(visibleFields: FieldDTO[], search: string): SQL | null {
  const searchable = visibleFields.filter((field) => DB_FILTER_TYPES.has(field.type));
  if (searchable.length === 0) return null;
  return or(...searchable.map((field) => ilikeSql(cellText(field.id), search))) ?? null;
}

function sortOrderSql(fieldsById: Map<string, FieldDTO>, sorts: SortRule[] | undefined): SQL[] | null {
  if (!sorts || sorts.length === 0) return [];
  const order: SQL[] = [];
  for (const sort of sorts) {
    const field = fieldsById.get(sort.fieldId);
    if (!field || !DB_FILTER_TYPES.has(field.type)) return null;
    const expr = SCALAR_NUMBER_TYPES.has(field.type) ? cellNumber(field.id) : sql`lower(coalesce(${cellText(field.id)}, ''))`;
    order.push(sort.direction === "desc" ? desc(expr) : asc(expr));
  }
  return order;
}

async function queryGroupSummaries(
  view: ViewDTO,
  tableFields: FieldDTO[],
  where: SQL | undefined
): Promise<ViewGroupSummary[]> {
  const field = view.config.groupBy ? tableFields.find((item) => item.id === view.config.groupBy) : undefined;
  if (!field || !DB_FILTER_TYPES.has(field.type)) return [];
  const keyExpr = sql<string>`coalesce(${cellText(field.id)}, '')`;
  const rows = await db
    .select({ key: keyExpr, count: sql<number>`count(*)::int` })
    .from(records)
    .where(where)
    .groupBy(keyExpr)
    .orderBy(asc(keyExpr));
  return rows.map((row) => groupKeyToSummary(field, row.key, row.count));
}

function groupToSummary(group: ReturnType<typeof groupRecords>[number]): ViewGroupSummary {
  return {
    key: group.key,
    label: group.value == null ? "Empty" : String(group.value),
    count: group.records.length,
  };
}

function groupKeyToSummary(field: FieldDTO, key: string, count: number): ViewGroupSummary {
  if (isBlankValue(key)) return { key: "__empty__", label: "Empty", count };
  const choices = (field.options.choices as { id: string; name: string; color?: string }[]) ?? [];
  const choice = choices.find((item) => item.id === key);
  return { key, label: choice?.name ?? key, color: choice?.color, count };
}

function cellText(fieldId: string): SQL {
  return sql`${records.cells}->>${fieldId}`;
}

function cellNumber(fieldId: string): SQL {
  return sql`nullif(${cellText(fieldId)}, '')::double precision`;
}

function ilikeSql(value: SQL, search: string): SQL {
  return sql`coalesce(${value}, '') ilike ${`%${escapeLike(search)}%`} escape '\\'`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
