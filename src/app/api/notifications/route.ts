import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { listNotifications, markRead, unreadCount } from "@/server/services/notifications";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    const [items, unread] = await Promise.all([listNotifications(userId), unreadCount(userId)]);
    return { items, unread };
  });
}

const patchBody = z.object({ id: z.string().optional(), all: z.boolean().optional() });

/** Mark one (by id) or all notifications read. */
export async function PATCH(req: Request) {
  return handle(async () => {
    const userId = await requireUserId();
    const opts = patchBody.parse(await req.json().catch(() => ({})));
    await markRead(userId, opts);
    return { ok: true, unread: await unreadCount(userId) };
  });
}
