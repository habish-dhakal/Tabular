import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { fields as fieldsTable, records } from "@/server/db/schema";
import { updateRecordCells } from "@/server/services/records";
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
      else console.warn(`[automations] updateRecord: unknown field "${name}"`);
    }
  }
  return out;
}

export const updateRecord: Executor = async (input, ctx) => {
  const recordId = String(input.recordId ?? "").trim();
  if (!recordId) throw new Error("updateRecord: 'recordId' is required");
  if (!ctx.actingUserId) throw new Error("updateRecord: automation has no owner to act as");

  const record = await db.query.records.findFirst({ where: eq(records.id, recordId) });
  if (!record) throw new Error(`updateRecord: record ${recordId} not found`);

  const tableFields = await db.query.fields.findMany({
    where: eq(fieldsTable.tableId, record.tableId),
  });
  const cells = cellsByName(tableFields, input.cells);
  await updateRecordCells(recordId, ctx.actingUserId, cells);
  return { recordId, updated: Object.keys(cells).length };
};
