import Link from "next/link";
import { requireUser } from "@/server/session";
import { ensureDefaultWorkspace, listWorkspacesForUser } from "@/server/services/workspaces";
import { TopBar } from "@/components/TopBar";
import { CreateButton } from "@/components/CreateButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await ensureDefaultWorkspace(user.id);
  const workspaces = await listWorkspacesForUser(user.id);

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar email={user.email} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="mb-9">
          <h1 className="text-2xl font-semibold tracking-tight">Your workspaces</h1>
          <p className="mt-1 text-sm text-muted">Open a base to start working, or create a new one.</p>
        </div>
        {workspaces.length === 0 && (
          <p className="text-muted">No workspaces yet.</p>
        )}
        {workspaces.map((ws) => (
          <section key={ws.id} className="mb-12">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <h2 className="text-base font-semibold tracking-tight">{ws.name}</h2>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                  {ws.role}
                </span>
              </div>
              <CreateButton
                label="New base"
                placeholder="Name your new base"
                endpoint={`/api/workspaces/${ws.id}/bases`}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {ws.bases.map((base) => (
                <Link
                  key={base.id}
                  href={`/base/${base.id}`}
                  className="group flex h-32 flex-col justify-between rounded-2xl border border-border-token bg-background p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                >
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-xl"
                    style={{ background: (base.color ?? "#1f6f5c") + "1f" }}
                  >
                    {base.icon ?? "📊"}
                  </div>
                  <div className="truncate font-medium transition-colors group-hover:text-accent">
                    {base.name}
                  </div>
                </Link>
              ))}
              {ws.bases.length === 0 && (
                <p className="col-span-full rounded-2xl border border-dashed border-border-token px-4 py-8 text-center text-sm text-muted">
                  No bases yet — create your first one.
                </p>
              )}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
