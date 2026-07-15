import { handle, requireUserId } from "@/server/api-helpers";
import { assertBaseAccess } from "@/server/services/access";
import { exportBaseBackup } from "@/server/services/import-export";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ baseId: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId);
    const backup = await exportBaseBackup(baseId);
    emitProductionSafetyEvent({ kind: "export.json", actorId: userId, baseId });
    return backup;
  }, { rateLimit: "export" });
}
