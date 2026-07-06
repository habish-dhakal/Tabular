import type { HttpInput } from "./senders";

/**
 * Fire an outbound HTTP request. Response body is truncated in the step log to
 * keep run rows small. Only reached when senders are not stubbed.
 */
export async function httpRequest(input: HttpInput): Promise<Record<string, unknown>> {
  const method = (input.method || "POST").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && input.body != null;
  const res = await fetch(input.url, {
    method,
    headers: input.headers,
    body: hasBody ? input.body : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    body: text.length > 2000 ? `${text.slice(0, 2000)}…` : text,
  };
}
