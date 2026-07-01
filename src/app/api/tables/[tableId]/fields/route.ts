import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { createField } from "@/server/services/fields";
import { fieldTypes } from "@/server/db/schema";

type Params = { params: Promise<{ tableId: string }> };

const body = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(fieldTypes),
  options: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    const { name, type, options } = body.parse(await req.json());
    return createField(tableId, name, type, options);
  });
}
