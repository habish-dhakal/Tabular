import ivm from "isolated-vm";

/**
 * Runs user-authored JavaScript for the `runScript` automation action inside a
 * real V8 isolate (isolated-vm) — a genuine security boundary: no `process`,
 * `require`, filesystem, or network reach the script, and CPU/memory are hard-
 * capped. The script is handed `input` (the current record/loop item) and can
 * emit results via `output.set(key, value)`; those become the step's output and
 * are referenceable by later steps as `{{output.key}}`.
 *
 * v1 is intentionally pure/computational: synchronous only (no async/await),
 * no `fetch`, no base read/write. Use the dedicated create/update/http actions
 * for side effects.
 */
export interface ScriptInput {
  /** Trigger record cells, keyed by field NAME (raw values, not stringified). */
  record: Record<string, unknown>;
  /** Current loop item's cells by field name, or null outside a loop. */
  item: Record<string, unknown> | null;
}

export interface ScriptResult {
  outputs: Record<string, unknown>;
  logs: string[];
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MEMORY_MB = 128;

export async function runUserScript(
  code: string,
  input: ScriptInput,
  opts: { timeoutMs?: number; memoryMb?: number } = {}
): Promise<ScriptResult> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const isolate = new ivm.Isolate({ memoryLimit: opts.memoryMb ?? DEFAULT_MEMORY_MB });
  try {
    const context = isolate.createContextSync();
    const jail = context.global;

    const outputs: Record<string, unknown> = {};
    const logs: string[] = [];

    // Data crosses the isolate boundary as copies/strings only. Host callbacks
    // are exposed as References the script invokes synchronously with copied args.
    jail.setSync("__input", new ivm.ExternalCopy(input).copyInto());
    jail.setSync(
      "__setOutputRef",
      new ivm.Reference((key: unknown, json: unknown) => {
        try {
          outputs[String(key)] = JSON.parse(String(json));
        } catch {
          outputs[String(key)] = String(json);
        }
      })
    );
    jail.setSync(
      "__logRef",
      new ivm.Reference((line: unknown) => {
        if (logs.length < 100) logs.push(String(line));
      })
    );

    // Build the sandboxed API around the user code, then run it under the cap.
    // Wrapping in an IIFE only affects the script's own scope — it can't reach
    // the host either way (the isolate has no Node globals).
    const wrapped = `(function () {
      var input = { config: function () { return __input; }, record: __input.record, item: __input.item };
      var output = { set: function (k, v) {
        __setOutputRef.applySync(undefined, [String(k), JSON.stringify(v === undefined ? null : v)], { arguments: { copy: true } });
      } };
      var console = {
        log: function () {
          var a = Array.prototype.slice.call(arguments);
          __logRef.applySync(undefined, [a.map(function (x) { return typeof x === "string" ? x : JSON.stringify(x); }).join(" ")], { arguments: { copy: true } });
        }
      };
      console.error = console.log; console.warn = console.log;
      ${code}
    })();`;

    context.evalSync(wrapped, { timeout });
    return { outputs, logs };
  } finally {
    isolate.dispose();
  }
}
