import { handle, requireUserId } from "@/server/api-helpers";
import { assertBaseAccess } from "@/server/services/access";
import { exportBaseBackup } from "@/server/services/import-export";

type Params = { params: Promise<{ baseId: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId);
    return exportBaseBackup(baseId);
  });
}
