import { handle, requireUserId } from "@/server/api-helpers";
import { acceptInvite } from "@/server/services/invites";

type Params = { params: Promise<{ token: string }> };

/** Redeem an invite for the signed-in user, joining them to the workspace. */
export async function POST(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { token } = await params;
    return acceptInvite(token, userId);
  });
}
