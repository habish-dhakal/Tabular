import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { records } from "@/server/db/schema";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess, assertTableCommentAccess } from "@/server/services/access";
import { createComment, listComments } from "@/server/services/comments";

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

const postBody = z.object({
  body: z.string().min(1).max(10000),
  mentions: z.array(z.string()).default([]),
});

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { recordId } = await params;
    await assertTableAccess(userId, await tableIdForRecord(recordId));
    return listComments(recordId);
  });
}

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { recordId } = await params;
    await assertTableCommentAccess(userId, await tableIdForRecord(recordId));
    const { body, mentions } = postBody.parse(await req.json());
    return createComment(recordId, userId, body, mentions);
  });
}
