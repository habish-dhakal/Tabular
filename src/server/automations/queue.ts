import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";

/**
 * BullMQ queue for record change events. The web process enqueues (see
 * `emitChangeEvent`); the separate worker process (`src/worker/index.ts`)
 * consumes. Both share the same queue name and redis connection settings.
 *
 * Redis is optional: if `REDIS_URL` is unset, `getConnection`/`getQueue` return
 * null and emitting becomes a no-op — the app still works, automations just
 * don't fire. Never let queue setup break a user's write.
 */
export const AUTOMATION_QUEUE_NAME = "automation-events";

// Reuse across HMR reloads in dev to avoid exhausting connections (mirrors db/index.ts).
const globalForQueue = globalThis as unknown as {
  __automationConnection?: IORedis | null;
  __automationQueue?: Queue | null;
};

export function getConnection(): IORedis | null {
  if (globalForQueue.__automationConnection !== undefined) {
    return globalForQueue.__automationConnection;
  }
  const url = process.env.REDIS_URL;
  const connection = url
    ? new IORedis(url, { maxRetriesPerRequest: null })
    : null;
  // Cache the singleton in every environment: on globalThis it survives HMR in
  // dev, and in production it prevents a new Redis connection per emit.
  globalForQueue.__automationConnection = connection;
  return connection;
}

export function getQueue(): Queue | null {
  if (globalForQueue.__automationQueue !== undefined) {
    return globalForQueue.__automationQueue;
  }
  const connection = getConnection();
  // Cast: bullmq bundles its own ioredis types which TS won't structurally
  // unify with ours; the instance is fully compatible at runtime.
  const queue = connection
    ? new Queue(AUTOMATION_QUEUE_NAME, { connection: connection as unknown as ConnectionOptions })
    : null;
  globalForQueue.__automationQueue = queue;
  return queue;
}
