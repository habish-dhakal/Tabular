"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/*
 * App-wide replacement for native window.confirm/prompt/alert. Imperative,
 * promise-based API so call sites read almost like the originals:
 *   if (await dialog.confirm({ message })) …
 *   const name = await dialog.prompt({ label });
 * Renders one polished, animated modal matching the design system.
 */

interface ConfirmOpts {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOpts extends ConfirmOpts {
  label?: string;
  placeholder?: string;
  defaultValue?: string;
}

interface DialogApi {
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  prompt: (o: PromptOpts) => Promise<string | null>;
  alert: (o: { title?: string; message?: string; confirmLabel?: string }) => Promise<void>;
}

type State =
  | ({ kind: "confirm" } & ConfirmOpts)
  | ({ kind: "prompt" } & PromptOpts)
  | ({ kind: "alert"; title?: string; message?: string; confirmLabel?: string })
  | null;

const Ctx = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useDialog must be used within <DialogProvider>");
  return api;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState("");
  const [mounted, setMounted] = useState(false);
  const resolver = useRef<((v: unknown) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  const openWith = useCallback((next: State, seed = "") => {
    setValue(seed);
    setState(next);
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => openWith({ kind: "confirm", ...o }) as Promise<boolean>, [openWith]);
  const prompt = useCallback((o: PromptOpts) => openWith({ kind: "prompt", ...o }, o.defaultValue ?? "") as Promise<string | null>, [openWith]);
  const alert = useCallback((o: { title?: string; message?: string; confirmLabel?: string }) => openWith({ kind: "alert", ...o }) as Promise<void>, [openWith]);
  const api = useMemo<DialogApi>(() => ({ confirm, prompt, alert }), [confirm, prompt, alert]);

  const settle = useCallback((result: unknown) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
  }, []);

  // Cancel = false (confirm) / null (prompt) / undefined (alert).
  const cancel = useCallback(() => {
    settle(state?.kind === "prompt" ? null : state?.kind === "alert" ? undefined : false);
  }, [settle, state]);

  const accept = useCallback(() => {
    if (state?.kind === "prompt") settle(value.trim() ? value : null);
    else if (state?.kind === "alert") settle(undefined);
    else settle(true);
  }, [settle, state, value]);

  // Focus the input (prompt) or confirm button on open.
  useEffect(() => {
    if (state?.kind === "prompt") inputRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
      else if (e.key === "Enter" && state.kind !== "prompt") { e.preventDefault(); accept(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, cancel, accept]);

  const showCancel = state?.kind !== "alert";
  const danger = state?.kind !== "alert" && state?.danger;

  return (
    <Ctx.Provider value={api}>
      {children}
      {mounted && state &&
        createPortal(
          <div
            className="anim-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm"
            onMouseDown={cancel}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="anim-modal w-full max-w-sm rounded-2xl border border-border-token bg-background p-5 shadow-lg"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {state.title && <h3 className="text-base font-semibold tracking-tight">{state.title}</h3>}
              {state.message && (
                <p className={"text-sm text-muted" + (state.title ? " mt-1.5" : "")}>{state.message}</p>
              )}

              {state.kind === "prompt" && (
                <div className="mt-3">
                  {state.label && <label className="mb-1 block text-xs font-medium text-muted">{state.label}</label>}
                  <input
                    ref={inputRef}
                    value={value}
                    placeholder={state.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); accept(); } }}
                    className="w-full rounded-lg border border-border-token bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-ring"
                  />
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                {showCancel && (
                  <button
                    data-testid="dialog-cancel"
                    onClick={cancel}
                    className="rounded-lg border border-border-token px-3.5 py-2 text-sm font-medium text-muted outline-none transition hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Cancel
                  </button>
                )}
                <button
                  data-testid="dialog-confirm"
                  onClick={accept}
                  autoFocus={state.kind !== "prompt"}
                  className={
                    "rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                    (danger ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500/50" : "bg-accent text-accent-contrast hover:bg-accent-hover focus-visible:ring-ring")
                  }
                >
                  {state.confirmLabel ?? (state.kind === "alert" ? "OK" : "Confirm")}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}
