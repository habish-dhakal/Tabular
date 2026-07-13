/**
 * SSRF guard for the outbound `httpRequest` automation action.
 *
 * The action lets a user fetch an arbitrary URL, so without a guard an
 * automation could reach loopback, link-local (incl. the 169.254.169.254 cloud
 * metadata endpoint), or RFC-1918 hosts on the server's own network. We block:
 *   1. non-http(s) schemes,
 *   2. literal IPs in private/reserved ranges,
 *   3. hostnames that resolve (via DNS) to such IPs.
 *
 * `isBlockedIp` and `isBlockedLiteralHost` are pure so the logic suite exercises
 * every range without a network. `assertUrlAllowed` does the DNS resolution and
 * is called by the real sender just before `fetch`. This narrows — but does not
 * fully close — DNS-rebinding (the address could change between our lookup and
 * fetch's own); a connect-time check would be needed to close it entirely.
 */
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/** True if an IPv4 dotted-quad falls in a private/reserved range. */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as blocked
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24 (test-net)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 198 && b === 51) return true; // 198.51.100/24 test-net-2
  if (a === 203 && b === 0) return true; // 203.0.113/24 test-net-3
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4) + 255.255.255.255
  return false;
}

/** True if an IPv6 address is loopback/unspecified/ULA/link-local/multicast. */
function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true; // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible — classify embedded v4.
  const mapped = addr.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  const head = addr.split(":")[0] ?? "";
  if (head.startsWith("fc") || head.startsWith("fd")) return true; // fc00::/7 unique-local
  if (head.startsWith("fe8") || head.startsWith("fe9") || head.startsWith("fea") || head.startsWith("feb"))
    return true; // fe80::/10 link-local
  if (head.startsWith("ff")) return true; // ff00::/8 multicast
  return false;
}

/** True if a literal IP address (v4 or v6) is in a blocked range. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP literal → caller shouldn't have passed it; block
}

/**
 * True if a hostname is a blocked literal without any DNS work: an IP literal in
 * a reserved range, or an obviously-internal name (localhost, *.local, *.internal).
 * Non-IP names that aren't obviously internal return false here — they still need
 * DNS resolution in `assertUrlAllowed`.
 */
export function isBlockedLiteralHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, ""); // strip [..] IPv6 brackets
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  if (isIP(host)) return isBlockedIp(host);
  return false;
}

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Parse `raw`, enforce http(s), reject blocked literal hosts, then resolve the
 * hostname and reject if any resolved address is in a blocked range.
 * Throws `SsrfBlockedError` on any violation.
 */
export async function assertUrlAllowed(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfBlockedError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`Blocked URL scheme: ${url.protocol}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedLiteralHost(host)) {
    throw new SsrfBlockedError(`Blocked host (internal/reserved): ${host}`);
  }
  if (isIP(host)) return; // literal IP already passed isBlockedLiteralHost

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new SsrfBlockedError(`Could not resolve host: ${host}`);
  }
  if (addrs.length === 0) throw new SsrfBlockedError(`Host did not resolve: ${host}`);
  for (const { address } of addrs) {
    if (isBlockedIp(address)) {
      throw new SsrfBlockedError(`Host ${host} resolves to a blocked address: ${address}`);
    }
  }
}
