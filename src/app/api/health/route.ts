import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { getConnection } from "@/server/automations/queue";

export const dynamic = "force-dynamic";

/** Bounded wait so a hung dependency can't hang the health check. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/**
 * Liveness/readiness probe for load balancers + uptime monitors.
 * Unauthenticated and unthrottled. 200 when Postgres is reachable, 503 if not.
 * Redis is reported but not required (the app degrades to no-automations).
 */
export async function GET() {
  let dbUp = false;
  try {
    await withTimeout(db.execute(sql`select 1`), 2000);
    dbUp = true;
  } catch {
    dbUp = false;
  }

  let redis: "up" | "down" | "disabled" = "disabled";
  const conn = getConnection();
  if (conn) {
    try {
      await withTimeout(conn.ping(), 1500);
      redis = "up";
    } catch {
      redis = "down";
    }
  }

  const status = dbUp ? "ok" : "degraded";
  return NextResponse.json(
    { status, db: dbUp ? "up" : "down", redis, time: new Date().toISOString() },
    { status: dbUp ? 200 : 503 }
  );
}
