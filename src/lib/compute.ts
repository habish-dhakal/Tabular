import type { FieldDTO, RecordDTO } from "@/lib/types";
import { ValueResolver } from "@/lib/value-resolver";

/**
 * Value to DISPLAY for a field on a record. For plain fields this is just the
 * stored cell; for computed fields (formula, created/updated time/by) it is
 * derived. `computeCellValue` is what every view should render, not raw cells.
 */
export function computeCellValue(
  field: FieldDTO,
  record: RecordDTO,
  fields: FieldDTO[],
  _seen: Set<string> = new Set()
): unknown {
  return new ValueResolver(fields).computedValue(field, record, _seen);
}
