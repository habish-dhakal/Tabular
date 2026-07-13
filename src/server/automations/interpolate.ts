import type { FieldDTO } from "@/lib/types";
import { ValueResolver, makeRecordContext } from "@/lib/value-resolver";

/**
 * Token interpolation for action config.
 *
 * Action config strings may reference the trigger record's fields **by name**
 * as `{{Field Name}}` (double-brace to disambiguate from formula's single
 * `{Field}`). We map name→id at run time against the table's fields and pull
 * the stored cell value. Trade-off (v1): renaming a field breaks its tokens.
 *
 * Inside a repeating group (loop), the current iteration's record is available
 * via `{{item.Field Name}}` (alias `{{current item.Field Name}}`), resolved
 * against the *looped* table's fields — not the trigger table's.
 *
 * - multi-value (array) cells → comma-joined
 * - null / undefined / unknown field → "" (unknown field also warns)
 * - only *stored* values resolve; computed fields aren't in `cells`.
 */
const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const ITEM_PREFIX_RE = /^(?:item|current item)\.(.+)$/i;
const OUTPUT_PREFIX_RE = /^output\.(.+)$/i;

/** The current loop item exposed to `{{item.*}}` tokens. */
export interface ItemContext {
  fields: FieldDTO[];
  cells: Record<string, unknown>;
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stringifyField(fields: FieldDTO[], cells: Record<string, unknown>, fieldId: string): string {
  const field = fields.find((f) => f.id === fieldId);
  if (!field) return "";
  return String(new ValueResolver(fields).resolveField(field, makeRecordContext(fields, cells), "automationToken"));
}

export type Interpolator = <T>(value: T) => T;

/**
 * Build an interpolator bound to the trigger record's fields + cells, and
 * optionally a loop `item` context for `{{item.*}}` tokens.
 */
export function makeInterpolator(
  fields: FieldDTO[],
  cells: Record<string, unknown>,
  item?: ItemContext,
  outputs?: Record<string, unknown>
): Interpolator {
  const idByName = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));
  const itemIdByName = item
    ? new Map(item.fields.map((f) => [f.name.toLowerCase(), f.id]))
    : null;

  const interpolateString = (str: string): string =>
    str.replace(TOKEN_RE, (_match, rawName: string) => {
      const outputMatch = rawName.match(OUTPUT_PREFIX_RE);
      if (outputMatch) {
        // {{output.key}} — a value emitted by an earlier runScript step.
        return outputs ? stringifyCell(outputs[outputMatch[1].trim()]) : "";
      }
      const itemMatch = rawName.match(ITEM_PREFIX_RE);
      if (itemMatch) {
        if (!itemIdByName || !item) return ""; // {{item.*}} outside a loop
        const fieldId = itemIdByName.get(itemMatch[1].trim().toLowerCase());
        if (!fieldId) {
          console.warn(`[automations] unknown item token field "${itemMatch[1]}"`);
          return "";
        }
        return stringifyField(item.fields, item.cells, fieldId);
      }
      const fieldId = idByName.get(rawName.toLowerCase());
      if (!fieldId) {
        console.warn(`[automations] unknown token field "${rawName}"`);
        return "";
      }
      return stringifyField(fields, cells, fieldId);
    });

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return interpolateString(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v)])
      );
    }
    return value;
  };

  return ((value) => walk(value)) as Interpolator;
}
