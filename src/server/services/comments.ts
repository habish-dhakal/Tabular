import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { comments, notifications, records } from "@/server/db/schema";
import { memberIdsForTable } from "@/server/services/workspaces";

export interface CommentDTO {
  id: string;
  recordId: string;
  body: string;
  mentions: string[];
  createdAt: string;
  author: { id: string; name: string | null; email: string; image: string | null } | null;
}

/** Comments on a record, oldest first, each with its author. */
export async function listComments(recordId: string): Promise<CommentDTO[]> {
  const rows = await db.query.comments.findMany({
    where: eq(comments.recordId, recordId),
    orderBy: asc(comments.createdAt),
    with: { author: { columns: { id: true, name: true, email: true, image: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    recordId: c.recordId,
    body: c.body,
    mentions: (c.mentions as string[]) ?? [],
    createdAt: (c.createdAt as Date).toISOString(),
    author: c.author ?? null,
  }));
}

/**
 * Add a comment to a record. `mentions` is the set of user ids @-mentioned in
 * the body; only ids that are actual members of the record's workspace are
 * kept, and each (except the author) gets a `mention` notification.
 */
export async function createComment(
  recordId: string,
  authorId: string,
  body: string,
  mentions: string[] = []
): Promise<CommentDTO> {
  const record = await db.query.records.findFirst({ where: eq(records.id, recordId) });
  if (!record) throw new Error("Record not found");
  const tableId = record.tableId;

  // Keep only real workspace members; never trust the client's id list blindly.
  const memberIds = await memberIdsForTable(tableId);
  const validMentions = [...new Set(mentions)].filter((id) => memberIds.has(id));

  const [comment] = await db
    .insert(comments)
    .values({ recordId, tableId, authorId, body, mentions: validMentions })
    .returning();

  const recipients = validMentions.filter((id) => id !== authorId);
  if (recipients.length) {
    const snippet = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    await db.insert(notifications).values(
      recipients.map((userId) => ({
        userId,
        type: "mention" as const,
        actorId: authorId,
        tableId,
        recordId,
        commentId: comment.id,
        body: snippet,
      }))
    );
  }

  const [full] = await listCommentsById(comment.id);
  return full;
}

async function listCommentsById(commentId: string): Promise<CommentDTO[]> {
  const rows = await db.query.comments.findMany({
    where: eq(comments.id, commentId),
    with: { author: { columns: { id: true, name: true, email: true, image: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    recordId: c.recordId,
    body: c.body,
    mentions: (c.mentions as string[]) ?? [],
    createdAt: (c.createdAt as Date).toISOString(),
    author: c.author ?? null,
  }));
}

export async function commentById(commentId: string) {
  return db.query.comments.findFirst({ where: eq(comments.id, commentId) });
}

/** Delete a comment (author only). */
export async function deleteComment(commentId: string) {
  await db.delete(comments).where(eq(comments.id, commentId));
}
