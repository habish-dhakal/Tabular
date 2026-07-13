"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type State = "pending" | "accepted" | "expired";

/**
 * Client-side accept flow for /invite/[token]. The user is already signed in
 * (the page redirects otherwise). Posts to the accept endpoint and routes into
 * the workspace on success.
 */
export function InviteAccept({
  token,
  workspaceName,
  role,
  state,
  pinnedEmail,
  currentEmail,
  invitedByName,
}: {
  token: string;
  workspaceName: string;
  role: string;
  state: State;
  pinnedEmail: string | null;
  currentEmail: string | null;
  invitedByName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailMismatch =
    !!pinnedEmail &&
    !!currentEmail &&
    pinnedEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase();

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      const { error } = await res.json().catch(() => ({ error: "Something went wrong." }));
      setError(error ?? "Something went wrong.");
      return;
    }
    // Joined — land on the dashboard where the new workspace now appears.
    router.push("/dashboard");
    router.refresh();
  }

  if (state === "expired") {
    return (
      <div className="text-center">
        <p className="text-sm text-muted">This invite has expired. Ask for a fresh link.</p>
        <Link
          href="/dashboard"
          className="mt-5 block rounded-lg border border-border-token py-2 text-sm font-medium transition hover:bg-surface"
        >
          Go to your workspaces
        </Link>
      </div>
    );
  }
  if (state === "accepted") {
    return (
      <div className="text-center">
        <p className="text-sm text-muted">This invite has already been used.</p>
        <Link
          href="/dashboard"
          className="mt-5 block rounded-lg border border-border-token py-2 text-sm font-medium transition hover:bg-surface"
        >
          Go to your workspaces
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-sm text-muted">
        {invitedByName ? (
          <>
            <span className="font-medium text-foreground">{invitedByName}</span> invited you to join
          </>
        ) : (
          "You've been invited to join"
        )}
      </p>
      <h1 className="mt-1 text-lg font-semibold tracking-tight">{workspaceName}</h1>
      <p className="mt-1 text-xs text-muted">
        as <span className="font-medium capitalize text-foreground">{role}</span>
      </p>

      {emailMismatch ? (
        <div className="mt-5 rounded-lg bg-red-500/10 px-3 py-3 text-sm text-red-600">
          This invite is for <span className="font-medium">{pinnedEmail}</span>, but you&apos;re signed
          in as {currentEmail}. Sign in with the invited address to accept.
        </div>
      ) : (
        <>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <button
            onClick={accept}
            disabled={busy}
            data-testid="accept-invite"
            className="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-contrast shadow-sm transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Joining…" : "Accept invite"}
          </button>
        </>
      )}
      <Link
        href="/dashboard"
        className="mt-3 block text-xs text-muted transition hover:text-foreground"
      >
        Not now
      </Link>
    </div>
  );
}
