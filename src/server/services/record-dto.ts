import type { RecordDTO } from "@/lib/types";
import { records } from "@/server/db/schema";

export type RecordRow = typeof records.$inferSelect;

export function toRecordDTO(record: RecordRow): RecordDTO {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
