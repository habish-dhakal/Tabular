import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertWorkspaceAccess } from "@/server/services/access";
import { createBase } from "@/server/services/workspaces";

type Params = { params: Promise<{ workspaceId: string }> };

const body = z.object({ name: z.string().min(1).max(255) });

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { workspaceId } = await params;
    await assertWorkspaceAccess(userId, workspaceId, true);
    const { name } = body.parse(await req.json());
    return createBase(workspaceId, name);
  });
}
