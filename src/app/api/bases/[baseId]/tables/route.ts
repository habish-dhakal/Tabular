import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertBaseAccess } from "@/server/services/access";
import { createTable, listTables } from "@/server/services/tables";

type Params = { params: Promise<{ baseId: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId);
    return { tables: await listTables(baseId) };
  });
}

const body = z.object({ name: z.string().min(1).max(255) });

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId, true);
    const { name } = body.parse(await req.json());
    return createTable(baseId, name);
  });
}
