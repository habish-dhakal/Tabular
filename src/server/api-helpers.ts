import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { AccessError } from "@/server/services/access";
import { checkRateLimit } from "@/server/rate-limit";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new AccessError(401, "Not authenticated");
  return session.user.id;
}

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

/** Best-effort client identifier for rate limiting: first x-forwarded-for hop,
 *  falling back to a shared bucket when no proxy header is present. */
async function clientKey(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Wrap a route handler so AccessError / thrown errors become clean JSON.
 *  Also enforces per-client rate limiting (no-op unless enabled — see
 *  rate-limit.ts). */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    const rl = await checkRateLimit(await clientKey());
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests — slow down and try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSec),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": String(rl.remaining),
          },
        }
      );
    }
    return ok(await fn());
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
