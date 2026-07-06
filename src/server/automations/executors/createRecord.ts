import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { fields as fieldsTable } from "@/server/db/schema";
import { createRecord as createRecordService } from "@/server/services/records";
import type { Executor } from "./index";

/** Map a `{ fieldName: value }` config object to `{ fieldId: value }`. */
function cellsByName(
  tableFields: { id: string; name: string }[],
  raw: unknown
): Record<string, unknown> {
  const idByName = new Map(tableFields.map((f) => [f.name.toLowerCase(), f.id]));
  const out: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
      const id = idByName.get(name.toLowerCase());
      if (id) out[id] = value;
      else console.warn(`[automations] createRecord: unknown field "${name}"`);
    }
  }
  return out;
}

export const createRecord: Executor = async (input, ctx) => {
  const tableId = String(input.tableId ?? "").trim();
  if (!tableId) throw new Error("createRecord: 'tableId' is required");
  if (!ctx.actingUserId) throw new Error("createRecord: automation has no owner to act as");

  const tableFields = await db.query.fields.findMany({ where: eq(fieldsTable.tableId, tableId) });
  const cells = cellsByName(tableFields, input.cells);
  const record = await createRecordService(tableId, ctx.actingUserId, cells);
  return { recordId: record.id, tableId };
};
