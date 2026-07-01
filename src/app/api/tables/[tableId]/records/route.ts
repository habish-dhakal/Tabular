import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { countRecords, createRecord, listRecords } from "@/server/services/records";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000), 5000);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const [records, total] = await Promise.all([
      listRecords(tableId, limit, offset),
      countRecords(tableId),
    ]);
    return { records, total };
  });
}

const body = z.object({ cells: z.record(z.string(), z.unknown()).optional() });

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    const parsed = body.parse(await req.json().catch(() => ({})));
    return createRecord(tableId, userId, parsed.cells ?? {});
  });
}
