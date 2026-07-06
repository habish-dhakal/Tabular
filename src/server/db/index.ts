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
  postgres(connectionString, {
    max: 10,
    // Recycle connections so a dropped DB (e.g. Docker Desktop pausing its VM)
    // doesn't leave the pool full of dead sockets — the server self-recovers
    // once Postgres is back, without a manual restart.
    idle_timeout: 20, // close idle conns after 20s
    max_lifetime: 60 * 30, // retire any conn after 30m
    connect_timeout: 10, // fail fast instead of hanging on a dead daemon
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tabularClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
