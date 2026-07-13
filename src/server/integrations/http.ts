import type { HttpInput } from "./senders";
import { assertUrlAllowed } from "./ssrf";

/**
 * Fire an outbound HTTP request. Response body is truncated in the step log to
 * keep run rows small. Only reached when senders are not stubbed.
 *
 * SSRF-guarded: `assertUrlAllowed` blocks loopback/link-local/private targets
 * (incl. the cloud metadata endpoint) before we ever open the socket.
 */
const MAX_REDIRECTS = 5;

export async function httpRequest(input: HttpInput): Promise<Record<string, unknown>> {
  const method = (input.method || "POST").toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD" && input.body != null;

  // Follow redirects manually so every hop is re-validated — otherwise a public
  // URL could 3xx-redirect to an internal target and slip past the guard.
  let url = input.url;
  let res: Response;
  for (let hop = 0; ; hop++) {
    await assertUrlAllowed(url);
    res = await fetch(url, {
      method,
      headers: input.headers,
      body: hasBody ? input.body : undefined,
      redirect: "manual",
    });
    if (res.status < 300 || res.status >= 400) break;
    const location = res.headers.get("location");
    if (!location) break;
    if (hop >= MAX_REDIRECTS) throw new Error("httpRequest: too many redirects");
    url = new URL(location, url).toString();
  }

  const text = await res.text();
  return {
    status: res.status,
    ok: res.ok,
    body: text.length > 2000 ? `${text.slice(0, 2000)}…` : text,
  };
}
