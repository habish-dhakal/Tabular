import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertWorkspaceAdminAccess } from "@/server/services/access";
import { createInvite, listInvites } from "@/server/services/invites";

type Params = { params: Promise<{ workspaceId: string }> };

const postBody = z.object({
  role: z.string(),
  email: z.string().email().optional().nullable(),
});

/** List pending/expired invites (admin only). */
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { workspaceId } = await params;
    await assertWorkspaceAdminAccess(userId, workspaceId);
    return listInvites(workspaceId);
  });
}

/** Create an invite link (admin only). */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { workspaceId } = await params;
    await assertWorkspaceAdminAccess(userId, workspaceId);
    const { role, email } = postBody.parse(await req.json());
    return createInvite(workspaceId, userId, role, email);
  });
}
