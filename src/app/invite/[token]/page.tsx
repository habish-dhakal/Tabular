import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth";
import { previewInvite } from "@/server/services/invites";
import { AccessError } from "@/server/services/access";
import { InviteAccept } from "@/components/members/InviteAccept";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border-token bg-background p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-contrast shadow-sm">
            T
          </span>
          <div className="text-xl font-semibold tracking-tight">Tabular</div>
        </div>
        {children}
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: Params) {
  const { token } = await params;

  // Accepting needs an identity — send unauthenticated visitors through sign-in
  // and back here. New teammates create an account on the login page.
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  let preview;
  try {
    preview = await previewInvite(token);
  } catch (e) {
    if (e instanceof AccessError) {
      return (
        <Shell>
          <p className="text-center text-sm text-muted">
            This invite link is invalid or no longer exists.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 block rounded-lg border border-border-token py-2 text-center text-sm font-medium transition hover:bg-surface"
          >
            Go to your workspaces
          </Link>
        </Shell>
      );
    }
    throw e;
  }

  return (
    <Shell>
      <InviteAccept
        token={token}
        workspaceName={preview.workspace?.name ?? "a workspace"}
        role={preview.role}
        state={preview.state}
        pinnedEmail={preview.email}
        currentEmail={session.user.email ?? null}
        invitedByName={preview.invitedBy?.name ?? preview.invitedBy?.email ?? null}
      />
    </Shell>
  );
}
