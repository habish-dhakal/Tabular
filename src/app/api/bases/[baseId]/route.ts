import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { bases } from "@/server/db/schema";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertBaseAccess } from "@/server/services/access";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ baseId: string }> };

const patchBody = z.object({
  name: z.string().min(1).max(255).optional(),
  icon: z.string().max(16).optional(),
  color: z.string().max(32).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId, true);
    const patch = patchBody.parse(await req.json());
    const [base] = await db.update(bases).set(patch).where(eq(bases.id, baseId)).returning();
    return base;
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId, true);
    await db.delete(bases).where(eq(bases.id, baseId)); // cascades to tables/fields/records/views
    emitProductionSafetyEvent({ kind: "base.delete", actorId: userId, baseId });
    return { ok: true };
  }, { rateLimit: "destructive" });
}
