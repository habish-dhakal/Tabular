import { notFound } from "next/navigation";
import { requireUser } from "@/server/session";
import { AccessError, assertBaseAccess } from "@/server/services/access";
import { getBaseWithTables } from "@/server/services/workspaces";
import { TopBar } from "@/components/TopBar";
import { BaseView } from "@/components/BaseView";

export const dynamic = "force-dynamic";

export default async function BasePage({
  params,
  searchParams,
}: {
  params: Promise<{ baseId: string }>;
  searchParams: Promise<{ table?: string; view?: string }>;
}) {
  const user = await requireUser();
  const { baseId } = await params;
  const { table, view } = await searchParams;

  try {
    await assertBaseAccess(user.id, baseId);
  } catch (err) {
    if (err instanceof AccessError) notFound();
    throw err;
  }

  const data = await getBaseWithTables(baseId);
  if (!data) notFound();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar email={user.email}>
        <span className="text-muted">/</span>
        <span className="flex items-center gap-1.5 font-medium">
          <span>{data.base.icon ?? "📊"}</span>
          {data.base.name}
        </span>
      </TopBar>
      <BaseView baseId={baseId} tables={data.tables} initialTableId={table} initialViewId={view} />
    </div>
  );
}
