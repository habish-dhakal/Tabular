import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { listRuns, tableIdForAutomation } from "@/server/services/automations";

type Params = { params: Promise<{ automationId: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { automationId } = await params;
    const tableId = await tableIdForAutomation(automationId);
    if (!tableId) throw new AccessError(404, "Automation not found");
    await assertTableAccess(userId, tableId);
    return listRuns(automationId);
  });
}
