import { handle, requireUserId } from "@/server/api-helpers";
import { previewInvite } from "@/server/services/invites";

type Params = { params: Promise<{ token: string }> };

/**
 * Preview an invite so a signed-in user can decide whether to accept.
 * Auth is required (to have an identity to attach on accept) but workspace
 * membership is not — that's what the invite grants.
 */
export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    await requireUserId();
    const { token } = await params;
    return previewInvite(token);
  });
}
