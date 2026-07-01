import { handle, requireUserId } from "@/server/api-helpers";
import { listWorkspacesForUser } from "@/server/services/workspaces";

export async function GET() {
  return handle(async () => {
    const userId = await requireUserId();
    return { workspaces: await listWorkspacesForUser(userId) };
  });
}
