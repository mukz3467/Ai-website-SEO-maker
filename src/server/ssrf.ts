import dns from 'dns/promises';
import net from 'net';
import { Agent } from 'undici';

export interface SafeFetchResult {
  finalUrl: string;
  statusCode: number;
  contentType: string;
  headers: Record<string, string>;
  html: string;
  byteLength: number;
  responseTimeMs: number;
  redirectChain: { url: string; status: number }[];
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
  '169.254.169.253',
  'metadata',
  'instance-data',
  'ecs-metadata',
  'internal',
  'intranet',
]);

const BLOCKED_DOMAIN_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
  '.corp',
  '.home',
  '.lan',
  '.arpa',
  '.test',
  '.invalid',
  '.example',
];

// Whitelist of allowed web ports to prevent internal port scanning
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

/**
 * Checks if an IPv4 address is within any private, reserved, loopback, or cloud-metadata range.
 */
export function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP is treated as unsafe
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network / "this" host)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private network RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Shared address space / Carrier-Grade NAT RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback RFC 1122)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local RFC 3927 & AWS/GCP/Azure metadata)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private network RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments RFC 6890)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1 RFC 5737)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay Anycast RFC 7526)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private network RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Network benchmark tests RFC 2544)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2 RFC 5737)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3 RFC 5737)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast RFC 5771)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Class E RFC 1112) & 255.255.255.255 (Broadcast)
  if (a >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is within any private, loopback, link-local, or mapped IPv4 range.
 */
export function isPrivateOrReservedIpv6(ip: string): boolean {
  const clean = ip.toLowerCase().trim().replace(/^\[|\]$/g, '');

  // Loopback & Unspecified
  if (clean === '::1' || clean === '::') return true;

  // IPv4-mapped IPv6 (::ffff:w.x.y.z or ::ffff:hex:hex)
  if (clean.startsWith('::ffff:')) {
    const sub = clean.slice(7);
    if (sub.includes('.')) {
      return isPrivateOrReservedIpv4(sub);
    }
    // Hex representation e.g. ::ffff:7f00:1
    const parts = sub.split(':');
    if (parts.length === 2) {
      const high = parseInt(parts[0], 16);
      const low = parseInt(parts[1], 16);
      if (!isNaN(high) && !isNaN(low)) {
        const ip4 = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
        return isPrivateOrReservedIpv4(ip4);
      }
    }
    return true;
  }

  // NAT64 prefix 64:ff9b::/96
  if (clean.startsWith('64:ff9b:')) {
    const sub = clean.replace('64:ff9b::', '');
    if (sub.includes('.')) {
      return isPrivateOrReservedIpv4(sub);
    }
    return true;
  }

  // Link-Local (fe80::/10)
  if (
    clean.startsWith('fe80:') ||
    clean.startsWith('fe90:') ||
    clean.startsWith('fea0:') ||
    clean.startsWith('feb0:')
  ) {
    return true;
  }

  // Unique Local Address ULA (fc00::/7 - fc00 to fdff)
  if (clean.startsWith('fc') || clean.startsWith('fd')) return true;

  // Multicast (ff00::/8)
  if (clean.startsWith('ff')) return true;

  // Documentation (2001:db8::/32)
  if (clean.startsWith('2001:db8:') || clean.startsWith('2001:0db8:')) return true;

  // Discard (100::/64)
  if (clean.startsWith('100:')) return true;

  return false;
}

/**
 * Universal IP verification helper
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.trim().replace(/^\[|\]$/g, '');
  const family = net.isIP(clean);
  if (family === 4) {
    return isPrivateOrReservedIpv4(clean);
  }
  if (family === 6) {
    return isPrivateOrReservedIpv6(clean);
  }
  return true; // Non-standard or unparseable IP format is unsafe
}

/**
 * Custom Undici Dispatcher Agent providing Connect-Time DNS Rebinding Protection.
 * Every resolved IP address is verified immediately before socket connection.
 */
export const ssrfSafeAgent = new Agent({
  connect: {
    timeout: 10_000,
    lookup: (hostname, options, callback) => {
      // First verify hostname is not blacklisted
      const lower = hostname.toLowerCase();
      if (BLOCKED_HOSTNAMES.has(lower) || BLOCKED_DOMAIN_SUFFIXES.some((s) => lower.endsWith(s))) {
        return callback(
          new Error(`SSRF_BLOCKED: Connection to restricted host "${hostname}" is prohibited.`),
          '',
          4
        );
      }

      // Perform resolution
      require('dns').lookup(hostname, { all: true }, (err: any, addresses: any[]) => {
        if (err) return callback(err, '', 4);
        if (!addresses || addresses.length === 0) {
          return callback(new Error(`WEBSITE_UNAVAILABLE: Could not resolve domain "${hostname}".`), '', 4);
        }

        // Validate EVERY returned address against private/reserved ranges
        for (const addr of addresses) {
          if (isPrivateOrReservedIp(addr.address)) {
            return callback(
              new Error(
                `SSRF_BLOCKED: Target resolved to restricted IP ${addr.address} during connection (DNS Rebinding prevented).`
              ),
              '',
              addr.family
            );
          }
        }

        // Return first safe resolved address
        const selected = addresses[0];
        callback(null, selected.address, selected.family);
      });
    },
  },
});

/**
 * Validates any raw URL string before fetching.
 * Normalizes host, inspects protocol, credentials, port, and pre-resolves DNS.
 */
export async function validatePublicUrl(rawInput: string): Promise<URL> {
  let trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('INVALID_URL: Please enter a valid website URL.');
  }

  // Reject URLs with embedded whitespace or control characters
  if (/[\s\t\r\n\0]/.test(trimmed)) {
    throw new Error('INVALID_URL: Website URLs cannot contain whitespace or control characters.');
  }

  // Reject malformed schemes containing ://
  if (trimmed.includes('://') && !/^https?:\/\//i.test(trimmed)) {
    throw new Error('INVALID_URL: Invalid or unsupported protocol scheme. Only HTTP and HTTPS are permitted.');
  }

  // Reject dangerous non-http protocols explicitly before any prepending
  const schemeMatch = trimmed.match(/^([^:/]+):/);
  if (schemeMatch) {
    const proto = schemeMatch[1].toLowerCase();
    if (proto !== 'http' && proto !== 'https') {
      throw new Error(`SSRF_BLOCKED: Protocol "${proto}:" is not supported. Only HTTP and HTTPS are permitted.`);
    }
  } else {
    trimmed = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('INVALID_URL: The URL format is invalid. Use a valid URL format like https://example.com.');
  }

  // Only allow http and https protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('INVALID_URL: Only HTTP and HTTPS protocols are supported.');
  }

  // Reject URLs containing embedded credentials (anti-SSRF / URL confusion defense)
  if (parsed.username || parsed.password) {
    throw new Error('SSRF_BLOCKED: Embedded credentials (user:pass@host) in URLs are rejected for security.');
  }

  // Port whitelist check
  if (!ALLOWED_PORTS.has(parsed.port)) {
    throw new Error(
      `SSRF_BLOCKED: Non-standard port "${parsed.port}" is not allowed. Only standard web ports (80, 443, 8080, 8443) are supported.`
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject blocked hostnames and internal suffixes
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_DOMAIN_SUFFIXES.some((s) => hostname.endsWith(s))
  ) {
    throw new Error('SSRF_BLOCKED: Auditing localhost, loopback, cloud metadata, or internal network hostnames is blocked for security.');
  }

  // Direct IP address validation (both IPv4 and IPv6)
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error('SSRF_BLOCKED: Auditing private, loopback, link-local, or cloud-metadata IP addresses is prohibited.');
    }
    return parsed;
  }

  // DNS pre-resolution & SSRF validation
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error(
        `WEBSITE_UNAVAILABLE: Could not resolve domain "${hostname}". Verify the domain exists and is publicly reachable.`
      );
    }
    for (const addr of addresses) {
      if (isPrivateOrReservedIp(addr.address)) {
        throw new Error(
          `SSRF_BLOCKED: Domain "${hostname}" resolves to a restricted internal or private IP range (${addr.address}).`
        );
      }
    }
  } catch (err: any) {
    if (err.message?.startsWith('SSRF_BLOCKED')) throw err;
    throw new Error(
      `WEBSITE_UNAVAILABLE: Could not resolve domain "${hostname}". Verify the domain exists and is publicly reachable.`
    );
  }

  return parsed;
}

/**
 * Executes a strictly guarded, SSRF-safe HTTP request with stream limits,
 * connect-time DNS validation, redirect checking, and timeout protection.
 */
export async function safeFetchUrl(
  initialUrl: string,
  options?: {
    maxRedirects?: number;
    maxBytes?: number;
    timeoutMs?: number;
    allowHttpErrors?: boolean;
    requireHtmlContentType?: boolean;
  }
): Promise<SafeFetchResult> {
  const maxRedirects = options?.maxRedirects ?? Number(process.env.MAX_REDIRECTS || 5);
  const maxBytes = options?.maxBytes ?? Number(process.env.MAX_HTML_BYTES || 2 * 1024 * 1024);
  const timeoutMs = options?.timeoutMs ?? Number(process.env.REQUEST_TIMEOUT_MS || 12000);
  const allowHttpErrors = options?.allowHttpErrors ?? false;
  const requireHtmlContentType = options?.requireHtmlContentType ?? false;

  let currentUrlObj = await validatePublicUrl(initialUrl);
  const redirectChain: { url: string; status: number }[] = [];
  const startTime = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await (fetch as any)(currentUrlObj.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        // Enforce connect-level DNS Rebinding defense dispatcher
        dispatcher: ssrfSafeAgent,
        headers: {
          'User-Agent': 'ZyvenSEO-AuditBot/2.0 (+https://zyvenseo.ai; Universal Website SEO Optimizer)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          // Explicitly never send internal cookies or authorization
        },
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`TIMEOUT: The website took longer than ${Math.round(timeoutMs / 1000)} seconds to respond.`);
      }
      if (err.message?.includes('SSRF_BLOCKED')) {
        throw err;
      }
      throw new Error(
        `WEBSITE_UNAVAILABLE: Unable to connect to "${currentUrlObj.hostname}". The website may be down, refusing connections, or blocking requests.`
      );
    } finally {
      clearTimeout(timer);
    }

    const status = res.status;

    // Follow safe redirects with full re-validation at each hop
    if (status >= 300 && status < 400) {
      const location = res.headers.get('location');
      redirectChain.push({ url: currentUrlObj.toString(), status });
      if (!location) {
        throw new Error('REDIRECT_PROBLEM: Server returned a redirect status without a Location header.');
      }
      if (hop === maxRedirects) {
        throw new Error(
          `REDIRECT_LIMIT: Website exceeded the maximum redirect limit (${maxRedirects} hops). Check for redirect loops.`
        );
      }
      const nextUrl = new URL(location, currentUrlObj).toString();
      // Re-validate the target destination strictly (SSRF / DNS checks)
      currentUrlObj = await validatePublicUrl(nextUrl);
      continue;
    }

    // Headers extraction with reasonable count limit
    const headers: Record<string, string> = {};
    let headerCount = 0;
    res.headers.forEach((value, key) => {
      if (headerCount < 100) {
        headers[key.toLowerCase()] = value;
        headerCount++;
      }
    });

    const rawContentType = headers['content-type'] || '';

    // Validate Content-Type if requested
    if (requireHtmlContentType) {
      const lowerCt = rawContentType.toLowerCase();
      const isHtmlLike =
        lowerCt.includes('text/html') ||
        lowerCt.includes('application/xhtml+xml') ||
        lowerCt.includes('text/xml') ||
        lowerCt.includes('application/xml') ||
        rawContentType === '';

      if (!isHtmlLike) {
        throw new Error(
          `UNSUPPORTED_CONTENT_TYPE: URL does not return an HTML webpage (received content-type: "${rawContentType.split(';')[0]}").`
        );
      }
    }

    // Handle 4xx / 5xx HTTP response codes when not explicitly allowed
    if (!allowHttpErrors && status >= 400) {
      if (status === 404) {
        throw new Error('HTTP_404: The target webpage returned HTTP 404 (Not Found). Verify the URL exists.');
      }
      if (status === 403 || status === 429) {
        throw new Error(
          `HTTP_BLOCKED: Target website is blocking automated requests (HTTP ${status}). The site may employ anti-bot or challenge protection.`
        );
      }
      if (status >= 500) {
        throw new Error(
          `HTTP_5XX: The target server returned HTTP ${status} (Server Error). The website is encountering internal server failures.`
        );
      }
      throw new Error(`HTTP_ERROR: Webpage returned HTTP ${status}. The request could not be completed.`);
    }

    // Stream consumption with strict byte cap
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel();
            break;
          }
          chunks.push(value);
        }
      }
    }

    const combined = new Uint8Array(Math.min(totalBytes, maxBytes));
    let offset = 0;
    for (const chunk of chunks) {
      if (offset + chunk.byteLength > combined.byteLength) break;
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(combined);
    const responseTimeMs = Math.max(1, Date.now() - startTime);

    return {
      finalUrl: currentUrlObj.toString(),
      statusCode: status,
      contentType: rawContentType,
      headers,
      html,
      byteLength: totalBytes,
      responseTimeMs,
      redirectChain,
    };
  }

  throw new Error('REDIRECT_LIMIT: Too many redirects.');
}
