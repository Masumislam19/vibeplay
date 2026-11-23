import dns from "node:dns";
import net from "node:net";
import { HttpError } from "./http";

/**
 * SSRF protection for the "import from URL" feature. Only public HTTPS
 * destinations are accepted; localhost, private networks, link-local,
 * loopback and non-HTTPS schemes are rejected.
 */

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".lan",
  ".home.arpa",
];

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;               // this-network, private, loopback
  if (a === 169 && b === 254) return true;                          // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;                 // private
  if (a === 192 && b === 168) return true;                          // private
  if (a === 100 && b >= 64 && b <= 127) return true;                // CGNAT
  if (a === 192 && b === 0) return true;                            // 192.0.0.0/24 protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true;             // benchmarking
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.replace("::ffff:", "");
    if (net.isIPv4(mapped)) return isPrivateIPv4(mapped);
  }
  return false;
}

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) return isPrivateIPv4(address);
  if (net.isIPv6(address)) return isPrivateIPv6(address);
  return true;
}

/** Validates that the URL is a public HTTPS endpoint safe to fetch server-side. */
export async function assertSafeHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "The provided value is not a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new HttpError(400, "Only HTTPS URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new HttpError(400, "URLs with embedded credentials are not allowed.");
  }
  if (url.port && url.port !== "443") {
    throw new HttpError(400, "Only the standard HTTPS port (443) is allowed.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new HttpError(400, "Local and internal hostnames are not allowed.");
  }

  // Literal IP hostnames are checked directly.
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new HttpError(400, "Private and loopback IP addresses are not allowed.");
    }
    return url;
  }

  // Hostnames are resolved to ensure they do not point at private networks.
  const resolved = await dns.promises.lookup(hostname, { all: true, verbatim: true }).catch(() => null);
  if (!resolved || resolved.length === 0) {
    throw new HttpError(400, "The URL host could not be resolved.");
  }
  for (const entry of resolved) {
    if (isPrivateAddress(entry.address)) {
      throw new HttpError(400, "The URL host resolves to a private network address.");
    }
  }

  return url;
}
