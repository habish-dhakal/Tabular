import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { createView, listViews } from "@/server/services/views";
import { viewTypes } from "@/server/db/schema";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    return { views: await listViews(tableId) };
  });
}

const body = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(viewTypes),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    const { name, type, config } = body.parse(await req.json());
    return createView(tableId, name, type, config, userId);
  });
}
