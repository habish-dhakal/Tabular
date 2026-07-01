import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { records } from "@/server/db/schema";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { deleteRecord, updateRecordCells } from "@/server/services/records";
import { enrichRecordsWithLinks } from "@/server/services/links";

type Params = { params: Promise<{ recordId: string }> };

async function tableIdForRecord(recordId: string) {
  const row = await db
    .select({ tableId: records.tableId })
    .from(records)
    .where(eq(records.id, recordId))
    .limit(1);
  if (!row[0]) throw new AccessError(404, "Record not found");
  return row[0].tableId;
}

const patchBody = z.object({ cells: z.record(z.string(), z.unknown()) });

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { recordId } = await params;
    const tableId = await tableIdForRecord(recordId);
    await assertTableAccess(userId, tableId, true);
    const { cells } = patchBody.parse(await req.json());
    const updated = await updateRecordCells(recordId, userId, cells);
    // Re-attach resolved link chips so the client doesn't lose them on edit.
    await enrichRecordsWithLinks(tableId, [updated as { id: string; cells: Record<string, unknown> }]);
    return updated;
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { recordId } = await params;
    const tableId = await tableIdForRecord(recordId);
    await assertTableAccess(userId, tableId, true);
    await deleteRecord(recordId);
    return { ok: true };
  });
}
