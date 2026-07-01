import type { FieldType } from "@/server/db/schema";

export type SelectChoice = { id: string; name: string; color: string };

export const SELECT_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
];

export interface FieldTypeMeta {
  type: FieldType;
  label: string;
  icon: string; // lucide icon name
  /** Computed fields are derived, never directly editable. */
  computed?: boolean;
  defaultOptions?: Record<string, unknown>;
}

export const FIELD_TYPE_META: Record<FieldType, FieldTypeMeta> = {
  singleLineText: { type: "singleLineText", label: "Single line text", icon: "Type" },
  longText: { type: "longText", label: "Long text", icon: "AlignLeft" },
  number: { type: "number", label: "Number", icon: "Hash", defaultOptions: { precision: 0 } },
  currency: { type: "currency", label: "Currency", icon: "DollarSign", defaultOptions: { precision: 2, symbol: "$" } },
  percent: { type: "percent", label: "Percent", icon: "Percent", defaultOptions: { precision: 0 } },
  checkbox: { type: "checkbox", label: "Checkbox", icon: "CheckSquare" },
  singleSelect: { type: "singleSelect", label: "Single select", icon: "ChevronDownCircle", defaultOptions: { choices: [] } },
  multiSelect: { type: "multiSelect", label: "Multiple select", icon: "List", defaultOptions: { choices: [] } },
  date: { type: "date", label: "Date", icon: "Calendar" },
  dateTime: { type: "dateTime", label: "Date & time", icon: "Clock" },
  url: { type: "url", label: "URL", icon: "Link" },
  email: { type: "email", label: "Email", icon: "Mail" },
  phone: { type: "phone", label: "Phone", icon: "Phone" },
  rating: { type: "rating", label: "Rating", icon: "Star", defaultOptions: { max: 5 } },
  attachment: { type: "attachment", label: "Attachment", icon: "Paperclip" },
  user: { type: "user", label: "User", icon: "User" },
  link: { type: "link", label: "Link to record", icon: "ArrowUpRight", defaultOptions: { allowMultiple: true } },
  lookup: { type: "lookup", label: "Lookup", icon: "Search", computed: true },
  rollup: { type: "rollup", label: "Rollup", icon: "Sigma", computed: true },
  formula: { type: "formula", label: "Formula", icon: "FunctionSquare", computed: true, defaultOptions: { expression: "" } },
  autoNumber: { type: "autoNumber", label: "Auto number", icon: "ListOrdered", computed: true },
  createdTime: { type: "createdTime", label: "Created time", icon: "CalendarPlus", computed: true },
  updatedTime: { type: "updatedTime", label: "Last modified time", icon: "CalendarClock", computed: true },
  createdBy: { type: "createdBy", label: "Created by", icon: "UserPlus", computed: true },
  updatedBy: { type: "updatedBy", label: "Last modified by", icon: "UserCog", computed: true },
};

export function isComputed(type: FieldType): boolean {
  return !!FIELD_TYPE_META[type].computed;
}

/**
 * Coerce/validate a raw incoming cell value into its canonical stored form.
 * Returns `undefined` to mean "clear the cell". Throws on invalid input.
 */
export function coerceCellValue(
  type: FieldType,
  value: unknown,
  options: Record<string, unknown>
): unknown {
  if (value === null || value === undefined || value === "") return undefined;

  switch (type) {
    case "singleLineText":
    case "longText":
    case "url":
    case "email":
    case "phone":
      return String(value);

    case "number":
    case "currency":
    case "percent": {
      const n = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(n)) throw new Error("Not a number");
      return n;
    }

    case "rating": {
      const max = (options.max as number) ?? 5;
      const n = Math.round(Number(value));
      if (Number.isNaN(n)) throw new Error("Not a number");
      return Math.max(0, Math.min(max, n));
    }

    case "checkbox":
      return Boolean(value);

    case "date":
    case "dateTime": {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
      return d.toISOString();
    }

    case "singleSelect": {
      const choices = (options.choices as SelectChoice[]) ?? [];
      const idStr = String(value);
      if (!choices.some((c) => c.id === idStr)) throw new Error("Unknown choice");
      return idStr;
    }

    case "multiSelect": {
      const choices = (options.choices as SelectChoice[]) ?? [];
      const arr = Array.isArray(value) ? value : [value];
      const ids = arr.map(String);
      for (const cid of ids) {
        if (!choices.some((c) => c.id === cid)) throw new Error("Unknown choice");
      }
      return ids;
    }

    case "attachment":
      return Array.isArray(value) ? value : [value];

    case "user":
      return String(value);

    // Computed & link fields are not written directly through cells.
    default:
      throw new Error(`Field type "${type}" is not directly editable`);
  }
}
