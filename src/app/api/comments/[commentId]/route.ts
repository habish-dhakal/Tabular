import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { commentById, deleteComment } from "@/server/services/comments";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ commentId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { commentId } = await params;
    const comment = await commentById(commentId);
    if (!comment) throw new AccessError(404, "Comment not found");
    await assertTableAccess(userId, comment.tableId);
    // Author-only delete in v1.
    if (comment.authorId !== userId) throw new AccessError(403, "You can only delete your own comments");
    await deleteComment(commentId);
    emitProductionSafetyEvent({ kind: "comment.delete", actorId: userId, tableId: comment.tableId, targetId: commentId });
    return { ok: true };
  }, { rateLimit: "destructive" });
}
