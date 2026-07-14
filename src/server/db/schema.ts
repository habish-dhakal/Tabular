import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
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
  "count", // count linked records
  "formula",
  "duration",
  "button",
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
export const viewTypes = ["grid", "list", "kanban", "calendar", "gallery", "form"] as const;
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
 *  visibility:"collaborative"|"personal"; ownerId; locked; favorite; section
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
 * AUTOMATIONS  (trigger → action rules, table-scoped)
 *
 * An automation watches a table for record changes and runs an ordered
 * list of action steps. Change events are enqueued after every record
 * mutation and processed by a separate worker (src/worker). Runs + steps
 * are persisted for a history/debug view.
 * ================================================================== */
export const automationTriggerTypes = [
  "recordCreated",
  "recordUpdated", // config: { watch: "all" } | { watch: "fields"; fieldIds: string[] }
  "recordMatchesCondition", // config: { conjunction; conditions: FilterCondition[] }
  "recordEntersCondition", // phase change: before did NOT match, after matches
  "recordDeleted",
  "scheduled", // config: { cron; timezone? } — stored in v1, worker ignores it
] as const;
export type AutomationTriggerType = (typeof automationTriggerTypes)[number];

export const automationActionTypes = [
  "sendEmail", // { to; subject; body; cc?; bcc? }
  "sendSlack", // { channel; text }
  "appendGoogleSheet", // { spreadsheetId; sheetName?; values: string[] }
  "createRecord", // { tableId; cells: Record<fieldName, string> }
  "updateRecord", // { recordId; cells: Record<fieldName, string> }
  "httpRequest", // { method; url; headers?; body? }
  "runScript", // { code } — sandboxed JS (isolated-vm); output.set() → {{output.key}}
] as const;
export type AutomationActionType = (typeof automationActionTypes)[number];

/**
 * An action node's kind. "action" = a leaf executor step (has `type` + `config`).
 * "loop"/"conditional" = group nodes (no executor `type`; `config` carries the
 * loop source / conditions) whose child nodes reference it via `parentId`.
 */
export const automationActionKinds = ["action", "loop", "conditional"] as const;
export type AutomationActionKind = (typeof automationActionKinds)[number];

export const automationRunStatus = ["running", "success", "error", "skipped"] as const;
export type AutomationRunStatus = (typeof automationRunStatus)[number];

export const automationStepStatus = ["success", "error", "skipped"] as const;
export type AutomationStepStatus = (typeof automationStepStatus)[number];

/**
 * triggerConfig JSONB shapes (keyed by triggerType):
 *  recordCreated:          {}
 *  recordUpdated:          { watch: "all" } | { watch: "fields", fieldIds: string[] }
 *  recordMatchesCondition: { conjunction: "and"|"or", conditions: FilterCondition[] }
 *  recordEntersCondition:  { conjunction: "and"|"or", conditions: FilterCondition[] }
 *  recordDeleted:          {}
 *  scheduled:              { frequency, minute?, hour?, weekday?, day?, timezone? } (see schedule.ts)
 * Action `config` string fields may contain {{Field Name}} interpolation tokens.
 */
export const automations = pgTable(
  "automation",
  {
    id: id("aut"),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    triggerType: text("trigger_type").$type<AutomationTriggerType>().notNull(),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
    // Last time the cron runner fired this (scheduled triggers only); drives
    // due-detection + dedupe across worker ticks/restarts.
    lastScheduledRunAt: timestamp("last_scheduled_run_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("automation_table_idx").on(t.tableId),
    index("automation_table_enabled_idx").on(t.tableId, t.enabled),
  ]
);

export const automationActions = pgTable(
  "automation_action",
  {
    id: id("act"),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    kind: text("kind").$type<AutomationActionKind>().notNull().default("action"),
    // Null for "loop"/"conditional" group nodes; set for "action" leaves.
    type: text("type").$type<AutomationActionType>(),
    // Parent group node (loop/conditional). Null = top-level. Self-cascade so
    // deleting a group removes its subtree.
    parentId: text("parent_id").references((): AnyPgColumn => automationActions.id, {
      onDelete: "cascade",
    }),
    // Ordering among siblings sharing the same parent.
    position: doublePrecision("position").notNull().default(0),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: now(),
  },
  (t) => [
    index("automation_action_aut_idx").on(t.automationId),
    index("automation_action_aut_pos_idx").on(t.automationId, t.position),
    index("automation_action_parent_idx").on(t.parentId),
  ]
);

export const automationRuns = pgTable(
  "automation_run",
  {
    id: id("run"),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    // NOT an FK: the record may be gone (recordDeleted trigger) yet the run stays.
    recordId: text("record_id"),
    status: text("status").$type<AutomationRunStatus>().notNull().default("running"),
    // Frozen snapshot of the change event that fired this run.
    trigger: jsonb("trigger").$type<Record<string, unknown>>().notNull().default({}),
    error: text("error"),
    startedAt: now(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("automation_run_aut_idx").on(t.automationId),
    index("automation_run_started_idx").on(t.automationId, t.startedAt),
  ]
);

export const automationRunSteps = pgTable(
  "automation_run_step",
  {
    id: id("rst"),
    runId: text("run_id")
      .notNull()
      .references(() => automationRuns.id, { onDelete: "cascade" }),
    // NOT an FK: action config may be edited/deleted after the run.
    actionId: text("action_id"),
    position: doublePrecision("position").notNull().default(0),
    type: text("type").$type<AutomationActionType>().notNull(),
    status: text("status").$type<AutomationStepStatus>().notNull(),
    // Resolved (post-interpolation) input handed to the executor + its result.
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    startedAt: now(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("automation_run_step_run_idx").on(t.runId)]
);

/* ================================================================== *
 * RELATIONS (for Drizzle relational queries)
 * ================================================================== */
export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  bases: many(bases),
  members: many(workspaceMembers),
  invites: many(workspaceInvites),
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
  automations: many(automations),
}));

export const automationsRelations = relations(automations, ({ many, one }) => ({
  table: one(tables, { fields: [automations.tableId], references: [tables.id] }),
  actions: many(automationActions),
  runs: many(automationRuns),
}));

export const automationActionsRelations = relations(automationActions, ({ one }) => ({
  automation: one(automations, {
    fields: [automationActions.automationId],
    references: [automations.id],
  }),
}));

export const automationRunsRelations = relations(automationRuns, ({ many, one }) => ({
  automation: one(automations, {
    fields: [automationRuns.automationId],
    references: [automations.id],
  }),
  steps: many(automationRunSteps),
}));

export const automationRunStepsRelations = relations(automationRunSteps, ({ one }) => ({
  run: one(automationRuns, {
    fields: [automationRunSteps.runId],
    references: [automationRuns.id],
  }),
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

/* ================================================================== *
 * COLLABORATION  (record comments, @mentions, notifications)
 * ================================================================== */
export const comments = pgTable(
  "comment",
  {
    id: id("cmt"),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    // Denormalized for access checks + list-by-table without a join.
    tableId: text("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // User ids @-mentioned in the body (drives notifications).
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    createdAt: now(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comment_record_idx").on(t.recordId, t.createdAt)]
);

export const notificationType = ["mention", "comment"] as const;
export type NotificationType = (typeof notificationType)[number];

export const notifications = pgTable(
  "notification",
  {
    id: id("ntf"),
    // Recipient.
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    tableId: text("table_id").references(() => tables.id, { onDelete: "cascade" }),
    // NOT FKs: the record/comment may be deleted while the notification stays.
    recordId: text("record_id"),
    commentId: text("comment_id"),
    body: text("body"), // snippet shown in the notification list
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.createdAt)]
);

export const commentsRelations = relations(comments, ({ one }) => ({
  record: one(records, { fields: [comments.recordId], references: [records.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

/* ================================================================== *
 * WORKSPACE INVITES (token-based; the id doubles as the share token)
 * ================================================================== */
export const workspaceInvites = pgTable(
  "workspace_invite",
  {
    // The id doubles as the opaque, unguessable token embedded in the invite link.
    id: id("inv"),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // Role granted on accept. Never "owner" — that is singular (workspace.ownerId).
    role: text("role").$type<WorkspaceRole>().notNull().default("editor"),
    // Optional: pin the invite to one email address (case-insensitive match on accept).
    email: text("email"),
    invitedById: text("invited_by_id").references(() => users.id, { onDelete: "set null" }),
    // Set once the invite is redeemed; a redeemed invite can't be reused.
    acceptedById: text("accepted_by_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [index("workspace_invite_ws_idx").on(t.workspaceId)]
);

export const workspaceInvitesRelations = relations(workspaceInvites, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceInvites.workspaceId],
    references: [workspaces.id],
  }),
  invitedBy: one(users, {
    fields: [workspaceInvites.invitedById],
    references: [users.id],
  }),
}));
