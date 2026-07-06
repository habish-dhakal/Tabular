import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { records } from "@/server/db/schema";
import { handle, requireUserId } from "@/server/api-helpers";
import { AccessError, assertTableAccess } from "@/server/services/access";
import { getAutomation } from "@/server/services/automations";
import { runAutomation } from "@/server/automations/run";
import { stubSenders } from "@/server/integrations/senders";
import type { ChangeEvent } from "@/server/automations/emit";

type Params = { params: Promise<{ automationId: string }> };

const body = z.object({ recordId: z.string() });

/**
 * Test-run an automation against an existing record. Runs the action steps
 * inline (bypassing trigger matching) with senders forced to stubs, so it's
 * side-effect-free and the resulting run/steps are inspectable via /runs.
 */
export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { automationId } = await params;

    const automation = await getAutomation(automationId);
    if (!automation) throw new AccessError(404, "Automation not found");
    await assertTableAccess(userId, automation.tableId, true);

    const { recordId } = body.parse(await req.json());
    const record = await db.query.records.findFirst({ where: eq(records.id, recordId) });
    if (!record || record.tableId !== automation.tableId) {
      throw new AccessError(400, "Record not found in this automation's table");
    }

    const cells = record.cells as Record<string, unknown>;
    const event: ChangeEvent = {
      kind: "record.updated",
      tableId: automation.tableId,
      recordId,
      before: cells,
      after: cells,
      changedFieldIds: [],
      depth: 0,
    };

    const result = await runAutomation(automation, event, { senders: stubSenders });
    return result;
  });
}
