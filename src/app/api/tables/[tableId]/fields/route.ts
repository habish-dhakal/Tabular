import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { createField } from "@/server/services/fields";
import { createLinkField } from "@/server/services/links";
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
    if (type === "link") {
      const linkedTableId = options?.linkedTableId as string | undefined;
      if (!linkedTableId) throw new AccessError(400, "A linked table is required");
      // Ensure the caller can access the target table (same workspace).
      await assertTableAccess(userId, linkedTableId, true);
      return createLinkField(tableId, name, linkedTableId, options?.allowMultiple !== false);
    }
    return createField(tableId, name, type, options);
  });
}
