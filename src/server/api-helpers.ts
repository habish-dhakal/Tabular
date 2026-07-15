import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { AccessError } from "@/server/services/access";
import { envelopeForError, requestIdFromHeaders } from "@/server/errors";
import {
  checkRateLimit,
  rateLimitConfigForAction,
  rateLimitKey,
  type RateLimitAction,
} from "@/server/rate-limit";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new AccessError(401, "Not authenticated");
  return session.user.id;
}

export function ok(data: unknown, init?: number, requestId?: string) {
  return NextResponse.json(data, {
    status: init ?? 200,
    headers: requestId ? { "X-Request-ID": requestId } : undefined,
  });
}

/** Best-effort client identifier for rate limiting: first x-forwarded-for hop,
 *  falling back to a shared bucket when no proxy header is present. */
function clientKey(h: { get(name: string): string | null }): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

export interface HandleOptions {
  rateLimit?: RateLimitAction | "none";
}

function withRequestId(response: Response, requestId: string): Response {
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("X-Request-ID", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

/** Wrap a route handler so AccessError / thrown errors become clean JSON.
 *  Also enforces per-client rate limiting (no-op unless enabled — see
 *  rate-limit.ts). */
export async function handle<T>(fn: () => Promise<T | Response>, options: HandleOptions = {}) {
  const h = await headers();
  const requestId = requestIdFromHeaders(h);
  try {
    const action = options.rateLimit ?? "api";
    if (action !== "none") {
      const session = await auth();
      const rl = await checkRateLimit(
        rateLimitKey({ action, ip: clientKey(h), userId: session?.user?.id }),
        rateLimitConfigForAction(action)
      );
      if (!rl.allowed) {
        return NextResponse.json(
          { error: "Too many requests - slow down and try again shortly.", code: "RATE_LIMITED", requestId },
          {
            status: 429,
            headers: {
              "Retry-After": String(rl.retryAfterSec),
              "X-RateLimit-Limit": String(rl.limit),
              "X-RateLimit-Remaining": String(rl.remaining),
              "X-Request-ID": requestId,
            },
          }
        );
      }
    }
    const result = await fn();
    return result instanceof Response ? withRequestId(result, requestId) : ok(result, undefined, requestId);
  } catch (err) {
    const envelope = envelopeForError(err, requestId);
    return NextResponse.json(envelope.body, {
      status: envelope.status,
      headers: { "X-Request-ID": requestId },
    });
  }
}
