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
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {workspaces.length === 0 && (
          <p className="text-muted">No workspaces yet.</p>
        )}
        {workspaces.map((ws) => (
          <section key={ws.id} className="mb-10">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">{ws.name}</h2>
                <p className="text-xs uppercase tracking-wide text-muted">{ws.role}</p>
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
                  className="group flex h-28 flex-col justify-between rounded-xl border border-border-token bg-background p-4 transition hover:border-accent hover:shadow-sm"
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-lg"
                    style={{ background: (base.color ?? "#6366f1") + "22" }}
                  >
                    {base.icon ?? "📊"}
                  </div>
                  <div className="truncate font-medium group-hover:text-accent">
                    {base.name}
                  </div>
                </Link>
              ))}
              {ws.bases.length === 0 && (
                <p className="col-span-full text-sm text-muted">
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
