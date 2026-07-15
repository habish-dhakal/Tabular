import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertTableAccess } from "@/server/services/access";
import { previewCsvImport } from "@/server/services/import-export";
import { fieldTypes } from "@/server/db/schema";

type Params = { params: Promise<{ tableId: string }> };

const mapping = z.object({
  header: z.string().min(1),
  action: z.enum(["map", "create", "skip"]).optional(),
  fieldId: z.string().optional(),
  name: z.string().optional(),
  type: z.enum(fieldTypes).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const body = z.object({
  csv: z.string().min(1).max(5_000_000),
  targetMode: z.enum(["append", "replace", "create", "merge"]).optional(),
  tableName: z.string().optional(),
  mergeFieldId: z.string().optional(),
  mergeHeader: z.string().optional(),
  mappings: z.array(mapping).optional(),
  createMissingFields: z.boolean().optional(),
});

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { tableId } = await params;
    await assertTableAccess(userId, tableId, true);
    const parsed = body.parse(await req.json());
    return previewCsvImport(tableId, parsed);
  }, { rateLimit: "import" });
}
