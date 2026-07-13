import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/server/session";
import { assertWorkspaceAccess, AccessError } from "@/server/services/access";
import { listMembers } from "@/server/services/members";
import { listInvites } from "@/server/services/invites";
import { canManageMembers } from "@/server/services/member-policy";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { workspaces } from "@/server/db/schema";
import { TopBar } from "@/components/TopBar";
import { MembersManager } from "@/components/members/MembersManager";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceId: string }> };

export default async function WorkspaceSettingsPage({ params }: Params) {
  const user = await requireUser();
  const { workspaceId } = await params;

  let role;
  try {
    role = await assertWorkspaceAccess(user.id, workspaceId);
  } catch (e) {
    if (e instanceof AccessError) notFound();
    throw e;
  }
  const canManage = canManageMembers(role);

  const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) });
  if (!ws) notFound();

  const members = await listMembers(workspaceId);
  const invites = canManage ? await listInvites(workspaceId) : [];

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar email={user.email} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Link
          href="/dashboard"
          className="mb-5 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
        >
          <ChevronLeft size={15} />
          Workspaces
        </Link>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">{ws.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {canManage
              ? "Manage who can access this workspace and invite new members."
              : "The people with access to this workspace."}
          </p>
        </div>
        <MembersManager
          workspaceId={workspaceId}
          currentUserId={user.id}
          canManage={canManage}
          initialMembers={members}
          initialInvites={invites}
        />
      </main>
    </div>
  );
}
