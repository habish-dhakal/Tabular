"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@tabular.dev");
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
      <div className="w-full max-w-sm rounded-xl border border-border-token bg-background p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-accent">Tabular</span>
          </div>
          <p className="mt-1 text-sm text-muted">Sign in to your workspace</p>
        </div>
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
            className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Continue"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Dev login — any email works and creates an account.
        </p>
      </div>
    </main>
  );
}
