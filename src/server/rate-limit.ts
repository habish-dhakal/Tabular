/**
 * Per-client API rate limiting.
 *
 * The pure window core (`memoryCheck`) is dependency-free so the logic suite can
 * exercise it without a clock or network. `checkRateLimit` picks a backend:
 * Redis (shared across web instances, via the automation queue's connection)
 * when configured, else an in-process Map (fine for a single instance / dev).
 *
 * Fixed-window counter: cheap, one INCR per request, good enough to blunt abuse
 * and runaway clients. Disabled outside production unless RATE_LIMIT_FORCE=1, so
 * the verify suites (which hammer a dev server from one IP) aren't throttled.
 */
export interface RateLimitConfig {
  enabled: boolean;
  max: number; // requests allowed per window
  windowSec: number; // window length in seconds
}

export function rateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  const max = env.RATE_LIMIT_MAX ? Number(env.RATE_LIMIT_MAX) : 240;
  const windowSec = env.RATE_LIMIT_WINDOW_SEC ? Number(env.RATE_LIMIT_WINDOW_SEC) : 60;
  // On in production; off elsewhere unless forced. max=0 disables entirely.
  const gate = env.NODE_ENV === "production" || env.RATE_LIMIT_FORCE === "1";
  return { enabled: gate && max > 0, max, windowSec };
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export interface WindowEntry {
  count: number;
  resetAt: number; // epoch ms
}

/**
 * Pure fixed-window check against a mutable store. `nowMs` is injected so tests
 * control time. Mutates `store` (increments / resets the entry for `key`).
 */
export function memoryCheck(
  store: Map<string, WindowEntry>,
  key: string,
  nowMs: number,
  max: number,
  windowMs: number
): RateLimitResult {
  const cur = store.get(key);
  if (!cur || nowMs >= cur.resetAt) {
    store.set(key, { count: 1, resetAt: nowMs + windowMs });
    return { allowed: true, limit: max, remaining: max - 1, retryAfterSec: 0 };
  }
  cur.count += 1;
  const allowed = cur.count <= max;
  return {
    allowed,
    limit: max,
    remaining: Math.max(0, max - cur.count),
    retryAfterSec: allowed ? 0 : Math.ceil((cur.resetAt - nowMs) / 1000),
  };
}

// Process-local fallback store (survives HMR via globalThis, like the queue).
const globalForRl = globalThis as unknown as { __rlStore?: Map<string, WindowEntry> };
const memStore: Map<string, WindowEntry> = (globalForRl.__rlStore ??= new Map());

/**
 * Check + consume one unit of the caller's budget. Returns `allowed:true`
 * (unlimited) when rate limiting is disabled. Never throws — on a Redis error
 * it fails open (allowing the request) so the limiter can't take the API down.
 */
export async function checkRateLimit(
  key: string,
  cfg: RateLimitConfig = rateLimitConfig()
): Promise<RateLimitResult> {
  if (!cfg.enabled) {
    return { allowed: true, limit: cfg.max, remaining: cfg.max, retryAfterSec: 0 };
  }

  // Imported lazily so pulling in this module (e.g. the logic suite) doesn't
  // eagerly load bullmq/ioredis.
  const { getConnection } = await import("@/server/automations/queue");
  const redis = getConnection();
  if (redis) {
    try {
      const rkey = `rl:${key}`;
      const n = await redis.incr(rkey);
      if (n === 1) await redis.expire(rkey, cfg.windowSec);
      let ttl = await redis.ttl(rkey);
      if (ttl < 0) ttl = cfg.windowSec;
      const allowed = n <= cfg.max;
      return {
        allowed,
        limit: cfg.max,
        remaining: Math.max(0, cfg.max - n),
        retryAfterSec: allowed ? 0 : ttl,
      };
    } catch {
      // Fail open — a limiter outage must not become an API outage.
      return { allowed: true, limit: cfg.max, remaining: cfg.max, retryAfterSec: 0 };
    }
  }

  return memoryCheck(memStore, key, Date.now(), cfg.max, cfg.windowSec * 1000);
}
