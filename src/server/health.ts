import { sql } from "drizzle-orm";

import { getConnection } from "@/server/automations/queue";
import { db } from "@/server/db";
import { validateRuntimeEnv, type RuntimeEnvReport } from "@/server/env";

export type DependencyState = "up" | "down" | "disabled";

export interface LivenessReport {
  status: "ok";
  time: string;
}

export interface ReadinessReport {
  status: "ok" | "degraded";
  db: DependencyState;
  redis: DependencyState;
  env: RuntimeEnvReport;
  time: string;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export function livenessReport(): LivenessReport {
  return { status: "ok", time: new Date().toISOString() };
}

export async function readinessReport(): Promise<ReadinessReport> {
  const env = validateRuntimeEnv();
  let dbState: DependencyState = "down";

  try {
    await withTimeout(db.execute(sql`select 1`), 2000);
    dbState = "up";
  } catch {
    dbState = "down";
  }

  let redis: DependencyState = "disabled";
  const conn = getConnection();
  if (conn) {
    try {
      await withTimeout(conn.ping(), 1500);
      redis = "up";
    } catch {
      redis = "down";
    }
  }

  return {
    status: env.ok && dbState === "up" ? "ok" : "degraded",
    db: dbState,
    redis,
    env,
    time: new Date().toISOString(),
  };
}

export function readinessStatusCode(report: ReadinessReport): number {
  return report.status === "ok" ? 200 : 503;
}
