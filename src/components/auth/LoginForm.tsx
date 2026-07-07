"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

function GithubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function LoginForm({ devLogin, github }: { devLogin: boolean; github: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await signIn("dev", { email, name, redirect: false });
      setLoading(false);
      if (res?.error) {
        setError("Could not sign in. Check the email address.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError("Sign-in failed: " + (err as Error).message);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-token bg-background p-8 shadow-lg">
        <div className="mb-7 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-contrast shadow-sm">
            T
          </span>
          <div className="text-xl font-semibold tracking-tight">Tabular</div>
          <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>
        </div>

        {github && (
          <button
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-token py-2 text-sm font-medium transition hover:bg-surface"
          >
            <GithubMark /> Continue with GitHub
          </button>
        )}

        {github && devLogin && (
          <div className="my-4 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border-token" /> or <span className="h-px flex-1 bg-border-token" />
          </div>
        )}

        {devLogin && (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border-token px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Name <span className="font-normal">(new accounts only)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border-token px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                  placeholder="Ada Lovelace"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Continue"}
              </button>
            </form>
            <p className="mt-4 text-center text-xs text-muted">
              Dev login — any email works and creates an account.
            </p>
          </>
        )}

        {!github && !devLogin && (
          <p className="rounded-lg bg-surface px-3 py-4 text-center text-sm text-muted">
            Authentication isn&apos;t configured. Set <code className="text-xs">AUTH_GITHUB_ID</code> /{" "}
            <code className="text-xs">AUTH_GITHUB_SECRET</code> to enable sign-in.
          </p>
        )}
      </div>
    </main>
  );
}
