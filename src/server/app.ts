import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { runWebsiteAudit, applySafeHtmlFixes } from './analyzer';
import { generateAiGrowthStrategy } from './aiEngine';
import crypto from 'crypto';
import type { GSCConnectionState, GSCProperty, GSCSearchData } from '../types/seo';
import {
  calculateDateRange,
  createOAuthState,
  deleteSession,
  fetchSearchAnalyticsData,
  fetchUserProperties,
  generateGscCsv,
  getOAuthConfig,
  getSession,
  getValidAccessToken,
  saveSession,
  validateOAuthState,
} from './gsc';
import {
  securityContextMiddleware,
  securityHeadersMiddleware,
  hardenedCorsMiddleware,
  stateChangeCsrfMiddleware,
  createEndpointRateLimiter,
  logSecurityEvent,
  maskIpAddress,
} from './security';
import { runSecurityTestSuite } from './securityTests';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security: Enforce 2MB request body size cap to prevent resource exhaustion / JSON bombs
app.use(express.json({ limit: '2mb' }));

// Mount production security middlewares
app.use(securityContextMiddleware);
app.use(securityHeadersMiddleware);
app.use(hardenedCorsMiddleware);
app.use(stateChangeCsrfMiddleware);

// Multi-tier Rate Limiters
const auditLimiter = createEndpointRateLimiter({
  bucket: 'audit',
  maxRequests: 15,
  windowMs: 5 * 60_000,
  maxConcurrency: 3,
});

const aiLimiter = createEndpointRateLimiter({
  bucket: 'ai',
  maxRequests: 8,
  windowMs: 5 * 60_000,
});

const gscLimiter = createEndpointRateLimiter({
  bucket: 'gsc',
  maxRequests: 30,
  windowMs: 5 * 60_000,
});

const fixLimiter = createEndpointRateLimiter({
  bucket: 'fix',
  maxRequests: 20,
  windowMs: 5 * 60_000,
});

// Helper to parse cookies from incoming requests
function parseCookies(req: express.Request): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('=').trim());
    }
  });
  return list;
}

// Helper to get or create a secure session ID cookie
function getOrCreateSessionId(req: express.Request, res: express.Response): string {
  const cookies = parseCookies(req);
  let sid = cookies['zyvenseo_gsc_sid'];
  if (!sid || sid.length < 16) {
    sid = crypto.randomUUID();
    res.setHeader(
      'Set-Cookie',
      `zyvenseo_gsc_sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
    );
  }
  return sid;
}

function mapAuditError(err: any): { code: string; userMessage: string; technicalHint: string } {
  const msg = String(err?.message || 'Unknown error');
  if (msg.startsWith('INVALID_URL:')) {
    return {
      code: 'INVALID_URL',
      userMessage: 'Invalid URL Format',
      technicalHint: msg.replace('INVALID_URL:', '').trim(),
    };
  }
  if (msg.startsWith('SSRF_BLOCKED:')) {
    return {
      code: 'SSRF_BLOCKED',
      userMessage: 'Restricted Network Address Blocked',
      technicalHint: msg.replace('SSRF_BLOCKED:', '').trim(),
    };
  }
  if (msg.startsWith('TIMEOUT:')) {
    return {
      code: 'TIMEOUT',
      userMessage: 'Website Connection Timeout',
      technicalHint: msg.replace('TIMEOUT:', '').trim(),
    };
  }
  if (msg.startsWith('UNSUPPORTED_CONTENT_TYPE:')) {
    return {
      code: 'UNSUPPORTED_CONTENT_TYPE',
      userMessage: 'URL does not return an HTML webpage',
      technicalHint: msg.replace('UNSUPPORTED_CONTENT_TYPE:', '').trim(),
    };
  }
  if (msg.startsWith('HTTP_404:')) {
    return {
      code: 'HTTP_404',
      userMessage: 'Webpage Not Found (HTTP 404)',
      technicalHint: msg.replace('HTTP_404:', '').trim(),
    };
  }
  if (msg.startsWith('HTTP_BLOCKED:') || msg.startsWith('HTTP_403:')) {
    return {
      code: 'HTTP_BLOCKED',
      userMessage: 'Target website is blocking automated requests',
      technicalHint: msg.replace(/^(HTTP_BLOCKED|HTTP_403):/, '').trim(),
    };
  }
  if (msg.startsWith('HTTP_5XX:')) {
    return {
      code: 'HTTP_5XX',
      userMessage: 'Target Server Error (HTTP 5xx)',
      technicalHint: msg.replace('HTTP_5XX:', '').trim(),
    };
  }
  if (msg.startsWith('HTTP_ERROR:')) {
    return {
      code: 'HTTP_ERROR',
      userMessage: 'HTTP Request Error',
      technicalHint: msg.replace('HTTP_ERROR:', '').trim(),
    };
  }
  if (msg.startsWith('REDIRECT_PROBLEM:')) {
    return {
      code: 'REDIRECT_PROBLEM',
      userMessage: 'Malformed Redirect Response',
      technicalHint: msg.replace('REDIRECT_PROBLEM:', '').trim(),
    };
  }
  if (msg.startsWith('REDIRECT_LIMIT:')) {
    return {
      code: 'REDIRECT_LIMIT',
      userMessage: 'Redirect Loop or Excessive Redirects',
      technicalHint: msg.replace('REDIRECT_LIMIT:', '').trim(),
    };
  }
  if (msg.startsWith('WEBSITE_UNAVAILABLE:')) {
    return {
      code: 'WEBSITE_UNAVAILABLE',
      userMessage: 'Website Unavailable or Host Not Found',
      technicalHint: msg.replace('WEBSITE_UNAVAILABLE:', '').trim(),
    };
  }
  return {
    code: 'SERVER_ERROR',
    userMessage: 'Unable to Complete Website Audit',
    technicalHint: 'The target website declined the connection or returned an unreadable response.',
  };
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    limits: {
      maxCrawlPages: Number(process.env.MAX_CRAWL_PAGES || 25),
      maxLinksPerPage: Number(process.env.MAX_LINKS_PER_PAGE || 120),
      maxHtmlBytes: Number(process.env.MAX_HTML_BYTES || 2097152),
      maxRedirects: Number(process.env.MAX_REDIRECTS || 5),
    },
  });
});

// Security status endpoint running 30-vector security tests
app.get('/api/security/audit-status', async (_req, res) => {
  try {
    const report = await runSecurityTestSuite();
    res.json(report);
  } catch (_err) {
    res.status(500).json({ error: true, message: 'Could not run security audit suite.' });
  }
});

const ALLOWED_MARKETS = new Set([
  'Global',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'European Union',
  'Custom',
]);

const ALLOWED_GOALS = new Set([
  'Increase Organic Traffic',
  'Target High-Intent Keywords',
  'Fix Technical & Indexing Issues',
  'Improve On-Page & Content Quality',
  'Prepare for Authority / Backlinks',
]);

const ALLOWED_CRAWL_MODES = new Set(['single', 'multi']);

app.post('/api/audit', auditLimiter, async (req, res) => {
  try {
    const { url, targetMarket, customMarket, primaryGoal, crawlMode } = req.body || {};

    // 1. URL Presence & Length Validation
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({
        error: {
          code: 'MISSING_URL',
          userMessage: 'Please enter a website URL to audit.',
          technicalHint: 'The "url" field is required and must be a valid string.',
        },
      });
    }

    if (url.length > 2048) {
      return res.status(400).json({
        error: {
          code: 'URL_TOO_LONG',
          userMessage: 'Website URL exceeds maximum safety length (2,048 characters).',
          technicalHint: 'Oversized URLs are rejected to prevent parser exploitation.',
        },
      });
    }

    // 2. Strict whitelist filtering for parameters
    const safeMarket = ALLOWED_MARKETS.has(targetMarket) ? targetMarket : 'Global';
    const safeGoal = ALLOWED_GOALS.has(primaryGoal) ? primaryGoal : 'Increase Organic Traffic';
    const safeCrawlMode = ALLOWED_CRAWL_MODES.has(crawlMode) ? crawlMode : 'single';
    const safeCustomMarket = typeof customMarket === 'string' ? customMarket.slice(0, 100).trim() : '';

    const auditResult = await runWebsiteAudit({
      url: url.trim(),
      targetMarket: safeMarket as any,
      customMarket: safeCustomMarket,
      primaryGoal: safeGoal as any,
      crawlMode: safeCrawlMode as any,
    });

    res.json({ audit: auditResult });
  } catch (err: any) {
    const mapped = mapAuditError(err);
    res.status(400).json({ error: mapped });
  }
});

app.post('/api/ai', aiLimiter, async (req, res) => {
  try {
    const { audit, gscData } = req.body || {};
    if (!audit || typeof audit !== 'object' || !audit.finalUrl || typeof audit.finalUrl !== 'string') {
      res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          userMessage: 'Audit Data Required',
          technicalHint: 'Please run a website audit first before generating the AI SEO Growth Plan.',
        },
      });
      return;
    }

    const strategy = await generateAiGrowthStrategy(audit, gscData);
    res.json({ strategy });
  } catch (_err: any) {
    res.status(500).json({
      error: {
        code: 'AI_UNAVAILABLE',
        userMessage: 'AI Service Unavailable',
        technicalHint: 'Could not complete AI SEO strategy generation at this moment.',
      },
    });
  }
});

app.post('/api/fix', fixLimiter, async (req, res) => {
  try {
    const { rawHtml, approvedFixIds, audit } = req.body || {};
    if (
      !rawHtml ||
      typeof rawHtml !== 'string' ||
      rawHtml.length > 2 * 1024 * 1024 ||
      !Array.isArray(approvedFixIds) ||
      !audit
    ) {
      res.status(400).json({
        error: {
          code: 'INVALID_FIX_PAYLOAD',
          userMessage: 'Invalid Fix Request',
          technicalHint: 'Missing HTML snapshot (max 2MB) or approved fix selection array.',
        },
      });
      return;
    }

    // Sanitize fix IDs array
    const safeIds = approvedFixIds
      .filter((id) => typeof id === 'string' && id.length < 100)
      .slice(0, 50);

    const result = applySafeHtmlFixes(rawHtml, safeIds, audit);
    res.json(result);
  } catch (_err: any) {
    res.status(500).json({
      error: {
        code: 'FIX_ERROR',
        userMessage: 'Unable to Apply Safe Fixes',
        technicalHint: 'An error occurred while applying deterministic HTML fixes.',
      },
    });
  }
});

// Google Search Console OAuth & Data Endpoints
app.get('/api/search-console/status', async (req, res) => {
  const oauthConfig = getOAuthConfig(req.get('host'), req.protocol);
  const cookies = parseCookies(req);
  const sid = cookies['zyvenseo_gsc_sid'];
  const session = getSession(sid);

  if (session) {
    const validToken = await getValidAccessToken(session, req.get('host'), req.protocol);
    if (validToken) {
      try {
        let properties = session.cachedData?.propertyUrl
          ? [{ siteUrl: session.cachedData.propertyUrl, displayName: session.cachedData.propertyUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, ''), type: session.cachedData.propertyType, permissionLevel: 'siteOwner' }]
          : [];
        
        try {
          properties = await fetchUserProperties(validToken);
        } catch {
          // Keep previous properties if transient API failure
        }

        const selectedProperty =
          session.selectedProperty || (properties.length > 0 ? properties[0].siteUrl : undefined);

        const state: GSCConnectionState = {
          status: 'Connected',
          oauthConfigured: true,
          properties,
          selectedProperty,
          message: 'Google Search Console Connected. Real Search Analytics available.',
          data: session.cachedData,
        };
        res.json(state);
        return;
      } catch {
        // Fall through to not connected
      }
    }
  }

  const state: GSCConnectionState = {
    status: 'Not Connected',
    oauthConfigured: oauthConfig.isConfigured,
    properties: [],
    message: oauthConfig.isConfigured
      ? 'Google OAuth credentials detected. Click "Connect Google Search Console" to authorize access.'
      : 'Google Search Console integration is not configured. Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server to enable live Search Console queries.',
  };
  res.json(state);
});

app.get('/api/search-console/auth', gscLimiter, (req, res) => {
  const oauthConfig = getOAuthConfig(req.get('host'), req.protocol);
  if (!oauthConfig.isConfigured) {
    res.status(400).json({
      status: 'Permission Required',
      oauthConfigured: false,
      message:
        'Google Search Console integration is not configured. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are missing or unconfigured on this server.',
    });
    return;
  }

  const sid = getOrCreateSessionId(req, res);
  const state = createOAuthState(sid);
  const scope = encodeURIComponent('https://www.googleapis.com/auth/webmasters.readonly');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    oauthConfig.clientId
  )}&redirect_uri=${encodeURIComponent(
    oauthConfig.redirectUri
  )}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(
    state
  )}`;

  res.json({ authUrl });
});

app.get('/api/search-console/callback', async (req, res) => {
  const error = req.query.error as string | undefined;
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const oauthConfig = getOAuthConfig(req.get('host'), req.protocol);

  if (error) {
    const errorDesc = (req.query.error_description as string) || error;
    res.status(400).send(`<!doctype html><html><body style="background:#0B0F17;color:#F1F5F9;font-family:sans-serif;padding:2rem;text-align:center;">
      <h2 style="color:#F87171;">Authorization Not Completed</h2>
      <p style="color:#94A3B8;">${error === 'access_denied' ? 'Access was denied or cancelled by user.' : errorDesc}</p>
      <p><a href="/" style="color:#34D399;text-decoration:none;">Return to ZyvenSEO AI</a></p>
    </body></html>`);
    return;
  }

  if (!state) {
    res.status(400).send('OAuth callback missing state parameter.');
    return;
  }

  const { valid, sessionId: stateSessionId } = validateOAuthState(state);
  if (!valid || !stateSessionId) {
    res.status(400).send(`<!doctype html><html><body style="background:#0B0F17;color:#F1F5F9;font-family:sans-serif;padding:2rem;text-align:center;">
      <h2 style="color:#F87171;">OAuth State Verification Failed</h2>
      <p style="color:#94A3B8;">The OAuth state parameter is invalid or has expired. Please initiate the connection again from ZyvenSEO AI.</p>
      <p><a href="/" style="color:#34D399;text-decoration:none;">Return to ZyvenSEO AI</a></p>
    </body></html>`);
    return;
  }

  if (!code || !oauthConfig.isConfigured) {
    res.status(400).send('OAuth callback missing authorization code or server configuration.');
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        redirect_uri: oauthConfig.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenJson: any = await tokenRes.json();
    if (!tokenJson.access_token) {
      const errMsg = tokenJson.error_description || tokenJson.error || 'Failed to exchange authorization code.';
      res.status(400).send(`<!doctype html><html><body style="background:#0B0F17;color:#F1F5F9;font-family:sans-serif;padding:2rem;text-align:center;">
        <h2 style="color:#F87171;">OAuth Token Exchange Failed</h2>
        <p style="color:#94A3B8;">${errMsg}</p>
        <p><a href="/" style="color:#34D399;text-decoration:none;">Return to ZyvenSEO AI</a></p>
      </body></html>`);
      return;
    }

    const accessToken = tokenJson.access_token;
    const refreshToken = tokenJson.refresh_token;
    const expiresIn = Number(tokenJson.expires_in) || 3600;

    // Fetch verified sites
    let properties: GSCProperty[] = [];
    try {
      properties = await fetchUserProperties(accessToken);
    } catch (err: any) {
      console.warn('Unable to fetch initial properties:', err.message);
    }

    const selectedProperty = properties.length > 0 ? properties[0].siteUrl : undefined;

    // Store in secure server-side session
    saveSession({
      sessionId: stateSessionId,
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      selectedProperty,
    });

    res.setHeader(
      'Set-Cookie',
      `zyvenseo_gsc_sid=${stateSessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}`
    );

    res.send(`<!doctype html><html><head><title>Google Search Console Connected</title></head><body style="background:#0B0F17;color:#F1F5F9;font-family:sans-serif;padding:2.5rem;text-align:center;">
      <div style="max-width:480px;margin:0 auto;background:#111827;border:1px solid #1F2937;border-radius:12px;padding:2rem;">
        <div style="width:48px;height:48px;border-radius:24px;background:rgba(52,211,153,0.15);color:#34D399;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:24px;">✓</div>
        <h2 style="margin:0 0 0.5rem;font-size:1.25rem;">Google Search Console Connected</h2>
        <p style="color:#94A3B8;font-size:0.875rem;margin:0 0 1.5rem;line-height:1.5;">Your verified Search Console properties are now authorized. You can close this window or return to the ZyvenSEO AI dashboard.</p>
        <a href="/" style="display:inline-block;background:#34D399;color:#0B0F17;font-weight:600;padding:0.6rem 1.4rem;border-radius:6px;text-decoration:none;font-size:0.875rem;">Return to Dashboard</a>
      </div>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'GSC_CONNECTED' }, '*');
          setTimeout(function() { window.close(); }, 1200);
        }
      </script>
    </body></html>`);
  } catch (err: any) {
    res.status(500).send(`<!doctype html><html><body style="background:#0B0F17;color:#F1F5F9;font-family:sans-serif;padding:2rem;text-align:center;">
      <h2 style="color:#F87171;">Connection Error</h2>
      <p style="color:#94A3B8;">An unexpected error occurred during Search Console authorization: ${err?.message || 'Internal error'}</p>
      <p><a href="/" style="color:#34D399;text-decoration:none;">Return to ZyvenSEO AI</a></p>
    </body></html>`);
  }
});

app.post('/api/search-console/properties', gscLimiter, async (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies['zyvenseo_gsc_sid'];
  const session = getSession(sid);

  if (!session) {
    res.status(401).json({ status: 'Not Connected', message: 'Not authorized with Google Search Console.' });
    return;
  }

  const validToken = await getValidAccessToken(session, req.get('host'), req.protocol);
  if (!validToken) {
    res.status(401).json({ status: 'Not Connected', message: 'OAuth session has expired. Please reconnect.' });
    return;
  }

  try {
    const properties = await fetchUserProperties(validToken);
    res.json({ properties });
  } catch (err: any) {
    res.status(500).json({ status: 'Connection Error', message: err.message || 'Failed to retrieve properties.' });
  }
});

app.post('/api/search-console/select-property', gscLimiter, async (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies['zyvenseo_gsc_sid'];
  const session = getSession(sid);

  if (!session) {
    res.status(401).json({ status: 'Not Connected', message: 'Not authorized with Google Search Console.' });
    return;
  }

  const { propertyUrl } = req.body || {};
  if (!propertyUrl) {
    res.status(400).json({ status: 'Connection Error', message: 'Property URL is required.' });
    return;
  }

  const validToken = await getValidAccessToken(session, req.get('host'), req.protocol);
  if (!validToken) {
    res.status(401).json({ status: 'Not Connected', message: 'OAuth session has expired.' });
    return;
  }

  // Security: verify property belongs to authorized user
  try {
    const properties = await fetchUserProperties(validToken);
    const exists = properties.some((p) => p.siteUrl === propertyUrl);
    if (!exists) {
      res.status(403).json({
        status: 'Permission Required',
        message: 'The selected property is not verified on your authorized Google account.',
      });
      return;
    }

    session.selectedProperty = propertyUrl;
    saveSession(session);
    res.json({ status: 'Connected', selectedProperty: propertyUrl });
  } catch (err: any) {
    res.status(500).json({ status: 'Connection Error', message: err.message || 'Failed to verify property.' });
  }
});

app.post('/api/search-console/data', gscLimiter, async (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies['zyvenseo_gsc_sid'];
  const session = getSession(sid);

  if (!session) {
    res.status(401).json({
      status: 'Not Connected',
      message: 'Google Search Console is not authorized. Connect via OAuth first.',
    });
    return;
  }

  const validToken = await getValidAccessToken(session, req.get('host'), req.protocol);
  if (!validToken) {
    res.status(401).json({
      status: 'Not Connected',
      message: 'Search Console authorization session expired. Please reconnect.',
    });
    return;
  }

  let { propertyUrl, preset, startDate, endDate } = req.body || {};

  // If no property specified in request, fetch authorized properties and pick first or session selected
  if (!propertyUrl) {
    if (session.selectedProperty) {
      propertyUrl = session.selectedProperty;
    } else {
      try {
        const properties = await fetchUserProperties(validToken);
        if (properties.length === 0) {
          res.status(400).json({
            status: 'Data Unavailable',
            message: 'No verified Google Search Console property found on this account.',
          });
          return;
        }
        propertyUrl = properties[0].siteUrl;
        session.selectedProperty = propertyUrl;
      } catch (err: any) {
        res.status(500).json({
          status: 'Connection Error',
          message: err.message || 'Unable to fetch user properties from Google Search Console.',
        });
        return;
      }
    }
  }

  // Security: check that the target property is authorized
  try {
    const properties = await fetchUserProperties(validToken);
    const hasAccess = properties.some((p) => p.siteUrl === propertyUrl);
    if (!hasAccess) {
      res.status(403).json({
        status: 'Permission Required',
        message: `Your Google account does not have Search Console permission for ${propertyUrl}.`,
      });
      return;
    }
  } catch {
    // If listing fails but request proceeds, Google API itself will enforce ACLs
  }

  const dateRange = calculateDateRange(preset, startDate, endDate);

  try {
    const gscData = await fetchSearchAnalyticsData(
      validToken,
      propertyUrl,
      dateRange.startDate,
      dateRange.endDate,
      dateRange.preset
    );

    // Cache in session
    session.cachedData = gscData;
    session.selectedProperty = propertyUrl;
    session.lastFetched = gscData.lastFetched;
    saveSession(session);

    res.json({
      status: 'Connected',
      data: gscData,
      message:
        gscData.rows.length === 0
          ? 'No Search Console data available for this property and date range.'
          : 'Google Search Console data retrieved successfully.',
    });
  } catch (err: any) {
    const msg = String(err?.message || 'Failed to retrieve Search Console data.');
    if (msg.includes('PERMISSION_DENIED')) {
      res.status(403).json({
        status: 'Permission Required',
        message: msg.replace('PERMISSION_DENIED:', '').trim(),
      });
      return;
    }

    res.status(500).json({
      status: 'Data Unavailable',
      message: msg.replace('GSC_API_ERROR:', '').trim(),
    });
  }
});

app.post('/api/search-console/disconnect', (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies['zyvenseo_gsc_sid'];
  if (sid) {
    deleteSession(sid);
  }
  res.setHeader(
    'Set-Cookie',
    'zyvenseo_gsc_sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax'
  );
  res.json({
    status: 'Not Connected',
    oauthConfigured: getOAuthConfig(req.get('host'), req.protocol).isConfigured,
    properties: [],
    message: 'Google Search Console disconnected. Session authorization cleared securely.',
  });
});

app.get('/api/search-console/export', gscLimiter, (req, res) => {
  const cookies = parseCookies(req);
  const sid = cookies['zyvenseo_gsc_sid'];
  const session = getSession(sid);

  if (!session || !session.cachedData) {
    res.status(400).send('No Search Console data available to export. Retrieve analytics first.');
    return;
  }

  const type = (req.query.type as 'queries' | 'pages' | 'all') || 'queries';
  const csvContent = generateGscCsv(session.cachedData, type);
  const filename = `zyvenseo-gsc-${type}-${session.cachedData.dateRange.startDate}-to-${session.cachedData.dateRange.endDate}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// Production Sanitized Error Handler (Never leaks stack traces, env vars or internal secrets)
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const reqId = (req as any).requestId || 'unknown';
  logSecurityEvent({
    requestId: reqId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode: 500,
    ipMasked: maskIpAddress(req.ip || ''),
    category: 'SECURITY',
    event: `Unhandled server exception: ${err?.message || 'unknown'}`,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      userMessage: 'Service temporarily unavailable. Please try again.',
      technicalHint: `Diagnostic request ID: ${reqId}`,
    },
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZyvenSEO AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
