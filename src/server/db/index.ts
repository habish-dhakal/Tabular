import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the client across HMR reloads in dev to avoid exhausting connections.
const globalForDb = globalThis as unknown as {
  __tabularClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__tabularClient ??
  postgres(connectionString, { max: 10 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tabularClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
