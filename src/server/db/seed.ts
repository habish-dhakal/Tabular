import { config } from "dotenv";
config({ path: ".env" });

import { eq } from "drizzle-orm";
import { db } from "./index";
import { bases, records, users, workspaceMembers, workspaces } from "./schema";
import { createTable } from "../services/tables";
import { listFields } from "../services/fields";

const DEMO_EMAIL = "demo@tabular.dev";

async function main() {
  console.log("Seeding demo data…");

  // Idempotent: wipe an existing demo user's data first.
  const existing = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) });
  if (existing) {
    await db.delete(users).where(eq(users.id, existing.id)); // cascades to workspaces/bases/…
  }

  const [user] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: "Demo User" })
    .returning();

  const [ws] = await db
    .insert(workspaces)
    .values({ name: "Demo Workspace", ownerId: user.id })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId: user.id, role: "owner" });

  const [base] = await db
    .insert(bases)
    .values({ workspaceId: ws.id, name: "Product Roadmap", icon: "🚀", color: "#6366f1" })
    .returning();

  const { table } = await createTable(base.id, "Features");
  const fields = await listFields(table.id);
  const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

  const sample = [
    { Name: "Realtime collaboration", Notes: "Yjs-based CRDT sync", Status: "doing" },
    { Name: "Formula fields", Notes: "Parser + evaluator", Status: "todo" },
    { Name: "Kanban view", Notes: "Group by single select", Status: "todo" },
    { Name: "CSV import", Notes: "Map columns to fields", Status: "done" },
  ];

  // Overwrite the 3 blank starter rows with sample data + one extra.
  const existingRecs = await db.query.records.findMany({ where: eq(records.tableId, table.id) });
  await db.delete(records).where(eq(records.tableId, table.id));
  void existingRecs;

  await db.insert(records).values(
    sample.map((row, i) => ({
      tableId: table.id,
      position: i,
      createdBy: user.id,
      updatedBy: user.id,
      cells: {
        [byName["Name"].id]: row.Name,
        [byName["Notes"].id]: row.Notes,
        [byName["Status"].id]: row.Status,
      },
    }))
  );

  console.log(`\n✓ Seeded. Log in with email:  ${DEMO_EMAIL}`);
  console.log(`  Workspace: ${ws.name}  →  Base: ${base.name}  →  Table: ${table.name}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
