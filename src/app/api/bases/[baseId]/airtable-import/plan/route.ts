import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertBaseAccess } from "@/server/services/access";
import { previewAirtableImport } from "@/server/services/import-export";

type Params = { params: Promise<{ baseId: string }> };

const airtableField = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const airtableRecord = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
});

const body = z.object({
  id: z.string().optional(),
  name: z.string(),
  tables: z.array(z.object({
    id: z.string(),
    name: z.string(),
    fields: z.array(airtableField),
    records: z.array(airtableRecord),
  })),
});

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId, true);
    return previewAirtableImport(body.parse(await req.json()));
  }, { rateLimit: "import" });
}
