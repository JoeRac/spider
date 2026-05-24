/**
 * SSRF guard — rejects URLs that resolve to private / loopback / link-local /
 * cloud-metadata targets so operator-configured external URLs cannot be used
 * to probe internal infrastructure.
 *
 * This is a literal-IP + known-hostname check (no live DNS resolution).
 * It covers the common attack surface for a server-side SSRF in this context.
 */

/** Ranges and hostnames that must never be fetched. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  '0.0.0.0',
  'metadata.google.internal',
]);

/**
 * Returns true when the URL is safe to fetch:
 *   - scheme is http or https
 *   - hostname is not loopback (127.x, ::1, localhost)
 *   - hostname is not a private IPv4 range (10/8, 172.16-31/12, 192.168/16)
 *   - hostname is not link-local IPv4 (169.254/16) or the EC2/GCP metadata IP
 *   - hostname is not a private IPv6 range (fc00::/7, ::1)
 *
 * Returns false on any parse error or blocked target.
 */
export function isSafeHttpUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  // Require http or https only.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const host = parsed.hostname.toLowerCase();

  // Block by exact hostname.
  if (BLOCKED_HOSTNAMES.has(host)) return false;

  // *.localhost subdomains also resolve to loopback.
  if (host.endsWith('.localhost')) return false;

  // IPv6 loopback: [::1]
  if (host === '::1' || host === '[::1]') return false;

  // Strip IPv6 brackets for range checks.
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  // Private / link-local IPv6 (fc00::/7 — covers fc00:: through fdff::).
  if (isPrivateIPv6(bare)) return false;

  // IPv4 checks.
  const octets = bare.split('.');
  if (octets.length === 4 && octets.every(o => /^\d+$/.test(o))) {
    const [a, b] = octets.map(Number) as [number, number, number, number];
    // 0.0.0.0/8 — "this network"
    if (a === 0) return false;
    // 10.0.0.0/8 — private
    if (a === 10) return false;
    // 100.64.0.0/10 — CGNAT shared address space
    if (a === 100 && b >= 64 && b <= 127) return false;
    // 127.0.0.0/8 — loopback
    if (a === 127) return false;
    // 169.254.0.0/16 — link-local / metadata (incl. 169.254.169.254)
    if (a === 169 && b === 254) return false;
    // 172.16.0.0/12 — private
    if (a === 172 && b >= 16 && b <= 31) return false;
    // 192.168.0.0/16 — private
    if (a === 192 && b === 168) return false;
    // 224.0.0.0/4 and above — multicast and reserved
    if (a >= 224) return false;
  }

  return true;
}

/**
 * Throws an Error with a clear message when the URL is not safe.
 * Use this at fetch sites where you want to propagate the rejection.
 */
export function assertSafeHttpUrl(rawUrl: string): void {
  if (!isSafeHttpUrl(rawUrl)) {
    throw new Error(`SSRF guard: URL rejected — private/internal targets are not allowed: ${rawUrl}`);
  }
}

// ─── IPv6 helpers ────────────────────────────────────────────────────────────

function isPrivateIPv6(addr: string): boolean {
  // Expand the first group to check fc00::/7.
  // fc00::/7 means the first 7 bits are 1111110x, i.e. first byte 0xFC or 0xFD.
  try {
    const groups = addr.split(':');
    if (groups.length < 1) return false;
    const first = groups[0];
    if (!first) return false;
    const val = parseInt(first, 16);
    if (isNaN(val)) return false;
    // fc00::/7 — covers 0xFC00 through 0xFDFF (first octet 0xFC or 0xFD)
    const firstByte = (val >> 8) & 0xff;
    if (firstByte === 0xfc || firstByte === 0xfd) return true;
  } catch {
    // ignore
  }
  return false;
}
