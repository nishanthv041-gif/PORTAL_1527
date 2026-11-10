import * as dns from "dns";
import { promisify } from "util";

const lookupAsync = promisify(dns.lookup);

export class SsrfError extends Error {
  constructor(message: string, public code: string = "ERR_SSRF_BLOCKED") {
    super(message);
    this.name = "SsrfError";
  }
}

/**
 * Checks if an IPv4 address is in a reserved/private/loopback/link-local range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid IP -> treat as unsafe
  }

  const [a, b] = parts;

  // 0.0.0.0/8 - Current network (only valid as source address)
  if (a === 0) return true;

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;

  // 10.0.0.0/8 - Private-use networks (RFC 1918)
  if (a === 10) return true;

  // 172.16.0.0/12 - Private-use networks (RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16 - Private-use networks (RFC 1918)
  if (a === 192 && b === 168) return true;

  // 169.254.0.0/16 - Link-local / AWS metadata (169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 100.64.0.0/10 - Shared address space (RFC 6598 carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 192.0.0.0/24 - IETF Protocol Assignments
  if (a === 192 && b === 0 && parts[2] === 0) return true;

  // 198.18.0.0/15 - Benchmarking
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 224.0.0.0/4 - Multicast
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 - Reserved for future use
  if (a >= 240) return true;

  // Broadcast
  if (ip === "255.255.255.255") return true;

  return false;
}

/**
 * Checks if an IPv6 address is reserved/loopback/private.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // Loopback ::1
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  // Unspecified ::
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;
  // Unique local addresses fc00::/7 (fc00:: - fdff::)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // Link-local unicast fe80::/10 (fe80:: - febf::)
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  // IPv4 mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.includes("::ffff:")) {
    const ipv4Part = normalized.split("::ffff:")[1];
    if (ipv4Part && isPrivateIPv4(ipv4Part)) return true;
  }
  return false;
}

/**
 * Verifies a URL against SSRF rules:
 * 1. Protocol MUST be https:
 * 2. Port MUST be 443 or default
 * 3. Hostname cannot be localhost / IP literal pointing to private space
 * 4. DNS resolution cannot resolve to any private / metadata IP
 */
export async function validateUrlForSsrf(targetUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    throw new SsrfError("Invalid URL format.", "ERR_INVALID_URL");
  }

  // 1. Enforce HTTPS only
  if (parsed.protocol !== "https:") {
    throw new SsrfError("Only secure HTTPS URLs are permitted.", "ERR_SSRF_PROTOCOL");
  }

  // 2. Enforce standard HTTPS port only
  if (parsed.port && parsed.port !== "443") {
    throw new SsrfError("Only standard HTTPS port 443 is permitted.", "ERR_SSRF_PORT");
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost or IP literal tricks
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new SsrfError(`Access to host '${hostname}' is restricted.`, "ERR_SSRF_BLOCKED");
  }

  // Check if hostname is direct IP
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new SsrfError(`Access to private IP '${hostname}' is blocked.`, "ERR_SSRF_BLOCKED");
    }
  }

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const v6 = hostname.slice(1, -1);
    if (isPrivateIPv6(v6)) {
      throw new SsrfError(`Access to private IPv6 '${hostname}' is blocked.`, "ERR_SSRF_BLOCKED");
    }
  }

  // 3. Pre-request DNS resolution & check ALL resolved addresses
  try {
    const results = await dns.promises.lookup(hostname, { all: true });
    if (!results || results.length === 0) {
      throw new SsrfError(`Could not resolve hostname '${hostname}'.`, "ERR_DNS_RESOLUTION");
    }

    for (const record of results) {
      if (record.family === 4) {
        if (isPrivateIPv4(record.address)) {
          throw new SsrfError(
            `Host '${hostname}' resolved to private address range (${record.address}).`,
            "ERR_SSRF_BLOCKED"
          );
        }
      } else if (record.family === 6) {
        if (isPrivateIPv6(record.address)) {
          throw new SsrfError(
            `Host '${hostname}' resolved to private address range (${record.address}).`,
            "ERR_SSRF_BLOCKED"
          );
        }
      }
    }
  } catch (err: any) {
    if (err instanceof SsrfError) throw err;
    throw new SsrfError(`DNS lookup failed for '${hostname}': ${err.message}`, "ERR_DNS_FAILED");
  }

  return parsed;
}

export interface SafeFetchResult {
  buffer: Buffer;
  contentType: string;
  finalUrl: string;
}

const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/jpeg",
  "image/png",
  "image/webp"
];

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 3;

/**
 * Safely fetches a remote URL with:
 * - Pre-request SSRF validation on initial URL and on each redirect
 * - 5s connection / 10s total timeout
 * - Max 2MB buffer enforcement
 * - Content-Type validation
 */
export async function safeFetchUrl(initialUrl: string): Promise<SafeFetchResult> {
  let currentUrl = initialUrl;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    const validated = await validateUrlForSsrf(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(validated.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SchoolManagementPortal/1.0",
          "Accept": "text/html,application/xhtml+xml,application/pdf,text/plain,text/csv;q=0.9,*/*;q=0.8"
        },
        redirect: "manual", // Handle manually to validate each redirect URL
        signal: controller.signal
      });

      // Handle redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new SsrfError("Redirect received without Location header.", "ERR_REDIRECT_FAILED");
        }
        currentUrl = new URL(location, currentUrl).toString();
        redirectCount++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Remote server responded with HTTP ${response.status}: ${response.statusText}`);
      }

      const rawContentType = response.headers.get("content-type") || "application/octet-stream";
      const contentType = rawContentType.split(";")[0].trim().toLowerCase();

      const isAllowed = ALLOWED_CONTENT_TYPES.some(allowed =>
        contentType.includes(allowed) || allowed.includes(contentType)
      );

      if (!isAllowed) {
        throw new SsrfError(
          `Unsupported Content-Type '${contentType}'. Only HTML, PDF, CSV, Excel, and images are supported.`,
          "ERR_UNSUPPORTED_CONTENT_TYPE"
        );
      }

      // Read stream with 2MB limit
      const body = response.body;
      if (!body) {
        throw new Error("Empty response body from target URL.");
      }

      const reader = body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > MAX_BYTES) {
            reader.cancel();
            throw new SsrfError(
              `Document exceeds maximum permitted size of 2 MB (${totalBytes} bytes received).`,
              "ERR_FILE_TOO_LARGE"
            );
          }
          chunks.push(value);
        }
      }

      return {
        buffer: Buffer.concat(chunks),
        contentType,
        finalUrl: currentUrl
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new SsrfError(`Exceeded maximum allowed redirects (${MAX_REDIRECTS}).`, "ERR_TOO_MANY_REDIRECTS");
}
