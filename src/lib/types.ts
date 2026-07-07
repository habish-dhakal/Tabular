import type {
  AutomationActionKind,
  AutomationActionType,
  AutomationTriggerType,
  FieldType,
  ViewType,
} from "@/server/db/schema";

export interface TableDTO {
  id: string;
  baseId: string;
  name: string;
  position: number;
}

export interface FieldDTO {
  id: string;
  tableId: string;
  name: string;
  type: FieldType;
  options: Record<string, unknown>;
  position: number;
  isPrimary: boolean;
}

export type FilterOp =
  | "is" | "isNot" | "contains" | "doesNotContain"
  | "isEmpty" | "isNotEmpty"
  | "eq" | "neq" | "lt" | "lte" | "gt" | "gte"
  | "isAnyOf" | "isNoneOf"
  | "hasAnyOf" | "hasAllOf" | "hasNoneOf"
  | "isBefore" | "isAfter" | "isOnOrBefore" | "isOnOrAfter";

export interface FilterCondition {
  id: string;
  fieldId: string;
  op: FilterOp;
  value?: unknown;
}

export interface SortRule {
  fieldId: string;
  direction: "asc" | "desc";
}

export interface ViewConfig {
  filters?: { conjunction: "and" | "or"; conditions: FilterCondition[] };
  sorts?: SortRule[];
  groupBy?: string | null;
  hiddenFieldIds?: string[];
  fieldOrder?: string[];
  fieldWidths?: Record<string, number>;
  rowHeight?: "short" | "medium" | "tall";
  stackFieldId?: string | null; // kanban
  dateFieldId?: string | null; // calendar
  coverFieldId?: string | null; // gallery
}

export interface ViewDTO {
  id: string;
  tableId: string;
  name: string;
  type: ViewType;
  config: ViewConfig;
  position: number;
}

export interface RecordDTO {
  id: string;
  tableId: string;
  cells: Record<string, unknown>;
  position: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TableBundle {
  table: TableDTO;
  fields: FieldDTO[];
  views: ViewDTO[];
}

/* -------------------- Automations -------------------- */
export type TriggerType = AutomationTriggerType;
export type ActionType = AutomationActionType;

export interface AutomationTrigger {
  type: TriggerType;
  config: Record<string, unknown>;
}

export type ActionKind = AutomationActionKind;

/** A stored action row (flat, as returned by the API). */
export interface AutomationAction {
  id: string;
  kind?: ActionKind; // defaults to "action"
  type: ActionType | null; // null for loop/conditional group nodes
  position: number;
  parentId?: string | null;
  config: Record<string, unknown>;
}

/** An action assembled into the builder's tree (group nodes carry children). */
export interface ActionNode {
  id: string;
  kind: ActionKind;
  type: ActionType | null;
  config: Record<string, unknown>;
  children: ActionNode[];
}

export interface AutomationDTO {
  id: string;
  tableId: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  actions: AutomationAction[];
  createdAt: string;
  updatedAt: string;
}

export type RunStatus = "running" | "success" | "error" | "skipped";

export interface RunStepLog {
  id: string;
  actionId: string | null;
  position: number;
  type: ActionType;
  status: "success" | "error" | "skipped";
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface AutomationRunDTO {
  id: string;
  status: RunStatus;
  recordId?: string | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  steps: RunStepLog[];
}
