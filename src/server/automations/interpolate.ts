import type { FieldDTO } from "@/lib/types";

/**
 * Token interpolation for action config.
 *
 * Action config strings may reference the trigger record's fields **by name**
 * as `{{Field Name}}` (double-brace to disambiguate from formula's single
 * `{Field}`). We map name→id at run time against the table's fields and pull
 * the stored cell value. Trade-off (v1): renaming a field breaks its tokens.
 *
 * - multi-value (array) cells → comma-joined
 * - null / undefined / unknown field → "" (unknown field also warns)
 * - only *stored* values resolve; computed fields aren't in `cells`.
 */
const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(stringifyCell).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type Interpolator = <T>(value: T) => T;

/** Build an interpolator bound to a set of fields + a record's cells. */
export function makeInterpolator(
  fields: FieldDTO[],
  cells: Record<string, unknown>
): Interpolator {
  const idByName = new Map(fields.map((f) => [f.name.toLowerCase(), f.id]));

  const interpolateString = (str: string): string =>
    str.replace(TOKEN_RE, (_match, rawName: string) => {
      const fieldId = idByName.get(rawName.toLowerCase());
      if (!fieldId) {
        console.warn(`[automations] unknown token field "${rawName}"`);
        return "";
      }
      return stringifyCell(cells[fieldId]);
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
