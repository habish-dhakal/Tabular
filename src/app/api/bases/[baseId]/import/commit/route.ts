import { z } from "zod";
import { handle, requireUserId } from "@/server/api-helpers";
import { assertBaseAccess } from "@/server/services/access";
import { commitBaseCsvImport } from "@/server/services/import-export";
import { fieldTypes } from "@/server/db/schema";
import { emitProductionSafetyEvent } from "@/server/production-events";

type Params = { params: Promise<{ baseId: string }> };

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
  mode: z.enum(["strict", "partial"]).optional(),
  targetMode: z.enum(["append", "replace", "create", "merge"]).optional(),
  tableId: z.string().optional(),
  tableName: z.string().optional(),
  mergeFieldId: z.string().optional(),
  mergeHeader: z.string().optional(),
  confirmReplace: z.boolean().optional(),
  mappings: z.array(mapping).optional(),
  createMissingFields: z.boolean().optional(),
});

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const userId = await requireUserId();
    const { baseId } = await params;
    await assertBaseAccess(userId, baseId, true);
    const report = await commitBaseCsvImport(baseId, userId, body.parse(await req.json()));
    emitProductionSafetyEvent({
      kind: "import.commit",
      actorId: userId,
      baseId,
      tableId: report.tableId,
      details: {
        jobId: report.jobId,
        targetMode: report.targetMode,
        totalRows: report.totalRows,
        insertedRows: report.insertedRows,
        updatedRows: report.updatedRows,
        skippedRows: report.skippedRows,
      },
    });
    return report;
  }, { rateLimit: "import" });
}
