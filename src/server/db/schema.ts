import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import { nanoid } from "nanoid";

/* ------------------------------------------------------------------ *
 * ID helper — short, sortable-ish, url-safe prefixed ids
 * ------------------------------------------------------------------ */
const id = (prefix: string) =>
  text("id")
    .primaryKey()
    .$defaultFn(() => `${prefix}_${nanoid(16)}`);

const now = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ================================================================== *
 * AUTH.JS TABLES  (shape required by @auth/drizzle-adapter)
 * ================================================================== */
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => `usr_${nanoid(16)}`),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
);

/* ================================================================== *
 * WORKSPACE  →  BASE  →  TABLE  →  FIELD / VIEW / RECORD
 * ================================================================== */
export const workspaces = pgTable("workspace", {
  id: id("ws"),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: now(),
});

export const workspaceRole = ["owner", "admin", "editor", "commenter", "viewer"] as const;
export type WorkspaceRole = (typeof workspaceRole)[number];

export const workspaceMembers = pgTable(
  "workspace_member",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<WorkspaceRole>().notNull().default("editor"),
    createdAt: now(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("wsm_user_idx").on(t.userId),
  ]
);

export const bases = pgTable(
  "base",
  {
    id: id("bas"),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon"),
    color: text("color"),
    createdAt: now(),
  },
  (t) => [index("base_ws_idx").on(t.workspaceId)]
);

export const tables = pgTable(
  "table",
  {
    id: id("tbl"),
    baseId: text("base_id")
      .notNull()
      .references(() => bases.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: doublePrecision("position").notNull().default(0),
    createdAt: now(),
  },
  (t) => [index("table_base_idx").on(t.baseId)]
);

/* ---- Field types ------------------------------------------------- */
export const fieldTypes = [
  "singleLineText",
  "longText",
  "number",
  "currency",
  "percent",
  "checkbox",
  "singleSelect",
  "multiSelect",
  "date",
  "dateTime",
  "url",
  "email",
  "phone",
  "rating",
  "attachment",
  "user",
  "link", // linked record → another table
  "lookup", // pull a value from a linked record
  "rollup", // aggregate over linked records
  "formula",
  "autoNumber",
  "createdTime",
  "updatedTime",
  "createdBy",
  "updatedBy",
] as const;
export type FieldType = (typeof fieldTypes)[number];

/**
 * Per-type configuration. Stored as JSONB so each field type can carry
 * its own options without schema changes.
 *  - singleSelect/multiSelect: { choices: {id,name,color}[] }
 *  - number/currency/percent:  { precision, symbol }
 *  - link:                     { linkedTableId, symmetricFieldId, allowMultiple }
 *  - formula:                  { expression }
 *  - lookup/rollup:            { linkFieldId, targetFieldId, fn }
 */
export const fields = pgTable(
  "field",
  {
    id: id("fld"),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<FieldType>().notNull(),
    options: jsonb("options").$type<Record<string, unknown>>().notNull().default({}),
    position: doublePrecision("position").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: now(),
  },
  (t) => [index("field_table_idx").on(t.tableId)]
);

/* ---- Views ------------------------------------------------------- */
export const viewTypes = ["grid", "kanban", "calendar", "gallery", "form"] as const;
export type ViewType = (typeof viewTypes)[number];

/**
 * config JSONB holds view-specific settings:
 *  filters:  { conjunction: "and"|"or", conditions: {fieldId,op,value}[] }
 *  sorts:    { fieldId, direction }[]
 *  groupBy:  fieldId | null
 *  hiddenFieldIds: string[]
 *  fieldOrder: string[]
 *  fieldWidths: Record<fieldId, number>
 *  rowHeight: "short"|"medium"|"tall"
 *  kanban:   { stackFieldId }
 *  calendar: { dateFieldId }
 */
export const views = pgTable(
  "view",
  {
    id: id("viw"),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").$type<ViewType>().notNull().default("grid"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    position: doublePrecision("position").notNull().default(0),
    createdAt: now(),
  },
  (t) => [index("view_table_idx").on(t.tableId)]
);

/* ---- Records ----------------------------------------------------- *
 * The row. Cell values live in a single JSONB column keyed by field id.
 * This keeps user-defined schemas out of DDL — no runtime migrations.
 * ------------------------------------------------------------------ */
export const records = pgTable(
  "record",
  {
    id: id("rec"),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    cells: jsonb("cells").$type<Record<string, unknown>>().notNull().default({}),
    position: doublePrecision("position").notNull().default(0),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("record_table_idx").on(t.tableId),
    index("record_table_pos_idx").on(t.tableId, t.position),
  ]
);

/* ---- Linked-record join table ------------------------------------ *
 * Many-to-many edges between records for `link` fields. The link field's
 * id identifies which relationship the edge belongs to.
 * ------------------------------------------------------------------ */
export const recordLinks = pgTable(
  "record_link",
  {
    id: id("lnk"),
    fieldId: text("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "cascade" }),
    fromRecordId: text("from_record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    toRecordId: text("to_record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("record_link_uniq").on(t.fieldId, t.fromRecordId, t.toRecordId),
    index("record_link_from_idx").on(t.fromRecordId),
    index("record_link_to_idx").on(t.toRecordId),
  ]
);

/* ================================================================== *
 * RELATIONS (for Drizzle relational queries)
 * ================================================================== */
export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  bases: many(bases),
  members: many(workspaceMembers),
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
}));

export const basesRelations = relations(bases, ({ many, one }) => ({
  workspace: one(workspaces, {
    fields: [bases.workspaceId],
    references: [workspaces.id],
  }),
  tables: many(tables),
}));

export const tablesRelations = relations(tables, ({ many, one }) => ({
  base: one(bases, { fields: [tables.baseId], references: [bases.id] }),
  fields: many(fields),
  views: many(views),
  records: many(records),
}));

export const fieldsRelations = relations(fields, ({ one }) => ({
  table: one(tables, { fields: [fields.tableId], references: [tables.id] }),
}));

export const viewsRelations = relations(views, ({ one }) => ({
  table: one(tables, { fields: [views.tableId], references: [tables.id] }),
}));

export const recordsRelations = relations(records, ({ one }) => ({
  table: one(tables, { fields: [records.tableId], references: [tables.id] }),
}));
