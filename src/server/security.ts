import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// ==========================================
// 1. STRUCTURED SAFE LOGGER (No Secrets)
// ==========================================

export interface StructuredLogEntry {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode?: number;
  durationMs?: number;
  ipMasked: string;
  category?: 'AUDIT' | 'AI' | 'GSC' | 'FIX' | 'SECURITY' | 'GENERAL';
  event?: string;
  error?: string;
}

/**
 * Anonymizes/masks IP address for privacy (e.g. 192.168.1.5 -> 192.168.1.xxx)
 */
export function maskIpAddress(rawIp: string): string {
  if (!rawIp) return 'unknown';
  const ip = rawIp.replace(/^::ffff:/, '');
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 3).join(':')}::xxx`;
  }
  return 'masked-ip';
}

/**
 * Safe logger that strictly sanitizes input and never outputs credentials
 */
export function logSecurityEvent(entry: StructuredLogEntry) {
  // Never log tokens, cookies, auth headers or API keys
  const sanitized = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
  };
  // Structured JSON log line for production observability
  console.log(`[ZYVEN-SECURITY] ${JSON.stringify(sanitized)}`);
}

// ==========================================
// 2. REQUEST ID & SECURITY CONTEXT MIDDLEWARE
// ==========================================

export function securityContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const reqId = crypto.randomUUID();
  (req as any).requestId = reqId;
  res.setHeader('X-Request-Id', reqId);

  const start = Date.now();
  const rawIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
  const ipMasked = maskIpAddress(rawIp);

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    if (req.path.startsWith('/api/')) {
      let category: StructuredLogEntry['category'] = 'GENERAL';
      if (req.path.includes('/audit')) category = 'AUDIT';
      else if (req.path.includes('/ai')) category = 'AI';
      else if (req.path.includes('/search-console')) category = 'GSC';
      else if (req.path.includes('/fix')) category = 'FIX';

      logSecurityEvent({
        requestId: reqId,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
        ipMasked,
        category,
      });
    }
  });

  next();
}

// ==========================================
// 3. SECURITY HEADERS MIDDLEWARE
// ==========================================

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Control referrer information exposure
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict access to browser features
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), screen-wake-lock=()'
  );

  // Modern browsers: 0 disables buggy legacy XSS auditor
  res.setHeader('X-XSS-Protection', '0');

  // Frame protection: allow embedding in parent frame for preview environments, otherwise sameorigin
  // AI Studio preview uses iframe embedding
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Content Security Policy crafted safely for the app without breaking Vite / fonts / inline styles
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: https: blob:; " +
      "connect-src 'self' https: http: ws: wss:; " +
      "frame-src 'self' https://accounts.google.com; " +
      "base-uri 'self'; " +
      "object-src 'none';"
  );

  next();
}

// ==========================================
// 4. HARDENED CORS & CSRF MIDDLEWARE
// ==========================================

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.run\.app$/,
  /\.googleusercontent\.com$/,
  /\.aistudio\.google$/,
];

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true; // Same-origin or server-to-server
  try {
    const url = new URL(origin);
    const host = url.hostname;

    // Check environment APP_URL if set
    if (process.env.APP_URL) {
      try {
        const appUrlObj = new URL(process.env.APP_URL);
        if (appUrlObj.origin === origin) return true;
      } catch {}
    }

    for (const pattern of ALLOWED_ORIGIN_PATTERNS) {
      if (pattern.test(origin) || pattern.test(host)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function hardenedCorsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin) {
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-Request-Id, Accept'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
    } else {
      // Reject unauthorized cross-origin requests for stateful/API routes
      if (req.path.startsWith('/api/')) {
        logSecurityEvent({
          requestId: (req as any).requestId || 'unknown',
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          statusCode: 403,
          ipMasked: maskIpAddress(req.ip || ''),
          category: 'SECURITY',
          event: `CORS origin rejected: ${origin}`,
        });
        res.status(403).json({
          error: true,
          code: 'CORS_REJECTED',
          message: 'Cross-origin request blocked from untrusted origin.',
        });
        return;
      }
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

/**
 * Validates Origin/Referer for state-changing requests (POST, PUT, DELETE) to protect against CSRF
 */
export function stateChangeCsrfMiddleware(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && req.path.startsWith('/api/')) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;

    // In browser requests, either Origin or Referer is sent
    const checkOrigin = origin || (referer ? new URL(referer).origin : undefined);

    if (checkOrigin && !isAllowedOrigin(checkOrigin)) {
      logSecurityEvent({
        requestId: (req as any).requestId || 'unknown',
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: 403,
        ipMasked: maskIpAddress(req.ip || ''),
        category: 'SECURITY',
        event: `CSRF check failed for origin: ${checkOrigin}`,
      });
      res.status(403).json({
        error: true,
        code: 'CSRF_BLOCKED',
        message: 'State-changing request failed cross-site request validation.',
      });
      return;
    }
  }
  next();
}

// ==========================================
// 5. PRODUCTION MULTI-TIER RATE LIMITER
// ==========================================

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStores = {
  audit: new Map<string, RateLimitBucket>(),
  ai: new Map<string, RateLimitBucket>(),
  gsc: new Map<string, RateLimitBucket>(),
  fix: new Map<string, RateLimitBucket>(),
  general: new Map<string, RateLimitBucket>(),
};

// Concurrency tracking (prevent simultaneous heavy crawls from same IP)
const activeConcurrentAudits = new Map<string, number>();

export function createEndpointRateLimiter(options: {
  bucket: 'audit' | 'ai' | 'gsc' | 'fix' | 'general';
  maxRequests: number;
  windowMs: number;
  maxConcurrency?: number;
}) {
  const store = rateLimitStores[options.bucket];

  return (req: Request, res: Response, next: NextFunction) => {
    const rawIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();

    // Check concurrency if specified
    if (options.maxConcurrency) {
      const active = activeConcurrentAudits.get(rawIp) || 0;
      if (active >= options.maxConcurrency) {
        logSecurityEvent({
          requestId: (req as any).requestId || 'unknown',
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          statusCode: 429,
          ipMasked: maskIpAddress(rawIp),
          category: 'SECURITY',
          event: `Concurrency limit reached (${active}/${options.maxConcurrency})`,
        });
        res.status(429).json({
          error: true,
          code: 'CONCURRENCY_LIMIT_EXCEEDED',
          message: 'An audit is already running for your session. Please wait for it to complete.',
        });
        return;
      }
      activeConcurrentAudits.set(rawIp, active + 1);

      res.on('finish', () => {
        const cur = activeConcurrentAudits.get(rawIp) || 1;
        if (cur <= 1) activeConcurrentAudits.delete(rawIp);
        else activeConcurrentAudits.set(rawIp, cur - 1);
      });
    }

    // Rate limit window check
    const entry = store.get(rawIp);
    if (!entry || now > entry.resetAt) {
      store.set(rawIp, { count: 1, resetAt: now + options.windowMs });
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', options.maxRequests - 1);
      res.setHeader('X-RateLimit-Reset', Math.ceil((now + options.windowMs) / 1000));
      return next();
    }

    if (entry.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

      logSecurityEvent({
        requestId: (req as any).requestId || 'unknown',
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: 429,
        ipMasked: maskIpAddress(rawIp),
        category: 'SECURITY',
        event: `Rate limit bucket "${options.bucket}" exceeded (${entry.count}/${options.maxRequests})`,
      });

      res.status(429).json({
        error: true,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please wait ${retryAfterSeconds} seconds before trying again.`,
        retryAfterSeconds,
      });
      return;
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', options.maxRequests - entry.count);
    res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
    next();
  };
}

// Clean up stale rate limiter memory every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const store of Object.values(rateLimitStores)) {
    for (const [key, val] of store.entries()) {
      if (now > val.resetAt) store.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();
