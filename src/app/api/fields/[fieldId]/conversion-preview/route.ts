import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { fields, fieldTypes } from "@/server/db/schema";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { previewFieldConversionForField } from "@/server/services/fields";

type Params = { params: Promise<{ fieldId: string }> };

const body = z.object({
  type: z.enum(fieldTypes),
  options: z.record(z.string(), z.unknown()).optional(),
});

async function tableIdForField(fieldId: string) {
  const row = await db
    .select({ tableId: fields.tableId })
    .from(fields)
    .where(eq(fields.id, fieldId))
    .limit(1);
  if (!row[0]) throw new AccessError(404, "Field not found");
  return row[0].tableId;
}

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { fieldId } = await params;
    const tableId = await tableIdForField(fieldId);
    await assertTableAccess(userId, tableId, true);
    const parsed = body.parse(await req.json());
    return previewFieldConversionForField(fieldId, parsed.type, parsed.options ?? {});
  });
}
