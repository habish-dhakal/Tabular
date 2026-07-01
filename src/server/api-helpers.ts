import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { AccessError } from "@/server/services/access";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new AccessError(401, "Not authenticated");
  return session.user.id;
}

export function ok(data: unknown, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

/** Wrap a route handler so AccessError / thrown errors become clean JSON. */
export async function handle<T>(fn: () => Promise<T>) {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
