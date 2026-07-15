import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { exportTableCsv } from "@/server/services/import-export";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    const url = new URL(req.url);
    const { csv, filename } = await exportTableCsv(tableId, url.searchParams.get("viewId") ?? undefined);
    emitProductionSafetyEvent({
      kind: "export.csv",
      actorId: userId,
      tableId,
      details: { filename, viewId: url.searchParams.get("viewId") ?? undefined },
    });
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  }, { rateLimit: "export" });
}
