import { NextResponse } from "next/server";
import { requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { exportTableCsv } from "@/server/services/import-export";

type Params = { params: Promise<{ tableId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId);
    const url = new URL(req.url);
    const { csv, filename } = await exportTableCsv(tableId, url.searchParams.get("viewId") ?? undefined);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const status = err instanceof AccessError ? err.status : 400;
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status });
  }
}
