import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { fields, records } from "@/server/db/schema";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { setLinks } from "@/server/services/links";
import type { FieldDTO } from "@/lib/types";

type Params = { params: Promise<{ recordId: string }> };

const body = z.object({ fieldId: z.string(), targetIds: z.array(z.string()) });

export async function PUT(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { recordId } = await params;

    const record = await db.query.records.findFirst({ where: eq(records.id, recordId) });
    if (!record) throw new AccessError(404, "Record not found");
    await assertTableAccess(userId, record.tableId, true);

    const { fieldId, targetIds } = body.parse(await req.json());
    const field = await db.query.fields.findFirst({ where: eq(fields.id, fieldId) });
    if (!field || field.type !== "link") throw new AccessError(400, "Not a link field");

    await setLinks(field as unknown as FieldDTO, recordId, targetIds);
    return { ok: true };
  });
}
