import crypto from 'crypto';
import type {
  GSCCountryRow,
  GSCDateTrendRow,
  GSCDeviceRow,
  GSCOpportunityItem,
  GSCPageRow,
  GSCProperty,
  GSCQueryRow,
  GSCSearchData,
} from '../types/seo';

interface GscSessionData {
  sessionId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp ms
  selectedProperty?: string;
  cachedData?: GSCSearchData;
  lastFetched?: string;
}

// In-memory server-side session token store
const sessionStore = new Map<string, GscSessionData>();

// CSRF state nonce store: stateNonce -> { createdAt: number, sessionId: string }
const oauthStateStore = new Map<string, { createdAt: number; sessionId: string }>();

// Cleanup stale sessions/states periodically (older than 24h)
setInterval(() => {
  const now = Date.now();
  for (const [state, item] of oauthStateStore.entries()) {
    if (now - item.createdAt > 15 * 60 * 1000) {
      oauthStateStore.delete(state);
    }
  }
  for (const [sid, sess] of sessionStore.entries()) {
    if (now - sess.expiresAt > 7 * 24 * 60 * 60 * 1000) {
      sessionStore.delete(sid);
    }
  }
}, 5 * 60 * 1000);

export function getOAuthConfig(reqHost?: string, reqProto?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';

  // Calculate redirect URI
  let redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!redirectUri) {
    const appUrl = process.env.APP_URL?.trim() || (reqHost ? `${reqProto || 'https'}://${reqHost}` : '');
    if (appUrl) {
      redirectUri = `${appUrl.replace(/\/$/, '')}/api/search-console/callback`;
    }
  }

  const isConfigured = Boolean(
    clientId &&
      clientSecret &&
      clientId !== 'MY_GOOGLE_CLIENT_ID' &&
      clientSecret !== 'MY_GOOGLE_CLIENT_SECRET'
  );

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || '',
    isConfigured,
  };
}

export function createOAuthState(sessionId: string): string {
  const nonce = crypto.randomBytes(24).toString('hex');
  oauthStateStore.set(nonce, { createdAt: Date.now(), sessionId });
  return nonce;
}

export function validateOAuthState(state: string): { valid: boolean; sessionId?: string } {
  if (!state) return { valid: false };
  const found = oauthStateStore.get(state);
  if (!found) return { valid: false };

  // 15-minute validity window
  const isValid = Date.now() - found.createdAt <= 15 * 60 * 1000;
  oauthStateStore.delete(state); // One-time use
  return { valid: isValid, sessionId: found.sessionId };
}

export function getSession(sessionId?: string): GscSessionData | null {
  if (!sessionId) return null;
  return sessionStore.get(sessionId) || null;
}

export function saveSession(session: GscSessionData) {
  sessionStore.set(session.sessionId, session);
}

export function deleteSession(sessionId: string) {
  sessionStore.delete(sessionId);
}

/**
 * Checks if token is valid, and refreshes if necessary using Google token endpoint
 */
export async function getValidAccessToken(
  session: GscSessionData,
  reqHost?: string,
  reqProto?: string
): Promise<string | null> {
  const now = Date.now();
  // If token is still valid for at least 2 minutes, use it
  if (session.accessToken && session.expiresAt - now > 2 * 60 * 1000) {
    return session.accessToken;
  }

  // If we have a refresh token, refresh it
  if (session.refreshToken) {
    const config = getOAuthConfig(reqHost, reqProto);
    if (!config.isConfigured) return null;

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: session.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!res.ok) {
        return null;
      }

      const json: any = await res.json();
      if (json.access_token) {
        session.accessToken = json.access_token;
        session.expiresAt = Date.now() + (Number(json.expires_in) || 3600) * 1000;
        if (json.refresh_token) {
          session.refreshToken = json.refresh_token;
        }
        saveSession(session);
        return session.accessToken;
      }
    } catch {
      return null;
    }
  }

  // If expired and no refresh token
  return null;
}

/**
 * Fetch list of verified Search Console sites for the authorized user
 */
export async function fetchUserProperties(accessToken: string): Promise<GSCProperty[]> {
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Search Console sites API error (${res.status}): ${errText}`);
  }

  const json: any = await res.json();
  const entries: any[] = Array.isArray(json.siteEntry) ? json.siteEntry : [];

  return entries.map((entry) => {
    const siteUrl = String(entry.siteUrl || '').trim();
    const isDomain = siteUrl.startsWith('sc-domain:');
    const displayName = isDomain
      ? siteUrl.replace(/^sc-domain:/, '')
      : siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    return {
      siteUrl,
      displayName,
      type: isDomain ? 'Domain property' : 'URL-prefix property',
      permissionLevel: String(entry.permissionLevel || 'siteOwner'),
    };
  });
}

/**
 * Date range calculation
 */
export function calculateDateRange(preset?: string, customStart?: string, customEnd?: string): {
  startDate: string;
  endDate: string;
  preset: string;
} {
  const today = new Date();
  // GSC data usually has a 2-day delay
  const defaultEnd = new Date(today);
  defaultEnd.setDate(today.getDate() - 2);

  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  if (preset === 'custom' && customStart && customEnd) {
    // Validate custom dates
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end && end <= today) {
      return {
        startDate: customStart,
        endDate: customEnd,
        preset: 'custom',
      };
    }
  }

  let days = 28;
  let activePreset = preset || '28d';

  if (preset === '7d') {
    days = 7;
    activePreset = '7d';
  } else if (preset === '3m') {
    days = 90;
    activePreset = '3m';
  } else if (preset === '6m') {
    days = 180;
    activePreset = '6m';
  } else {
    days = 28;
    activePreset = '28d';
  }

  const startDateObj = new Date(defaultEnd);
  startDateObj.setDate(defaultEnd.getDate() - days);

  return {
    startDate: formatDate(startDateObj),
    endDate: formatDate(defaultEnd),
    preset: activePreset,
  };
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
function getCountryFullName(code: string): string {
  const cleanCode = code.toUpperCase().trim();
  if (!cleanCode || cleanCode === 'UNKNOWN') return 'Unknown Region';
  try {
    return countryNames.of(cleanCode) || cleanCode;
  } catch {
    return cleanCode;
  }
}

/**
 * Fetch and build comprehensive Search Console Analytics dataset
 */
export async function fetchSearchAnalyticsData(
  accessToken: string,
  propertyUrl: string,
  startDate: string,
  endDate: string,
  presetLabel?: string
): Promise<GSCSearchData> {
  const encodedProperty = encodeURIComponent(propertyUrl);
  const baseApiUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedProperty}/searchAnalytics/query`;

  // 1. Fetch Query & Page breakdown (up to 500 rows)
  const queryPromise = fetch(baseApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['query', 'page'],
      rowLimit: 500,
    }),
  });

  // 2. Fetch Countries breakdown
  const countryPromise = fetch(baseApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['country'],
      rowLimit: 50,
    }),
  }).catch(() => null);

  // 3. Fetch Devices breakdown
  const devicePromise = fetch(baseApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['device'],
      rowLimit: 10,
    }),
  }).catch(() => null);

  // 4. Fetch Date trend
  const datePromise = fetch(baseApiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['date'],
      rowLimit: 180,
    }),
  }).catch(() => null);

  const [queryRes, countryRes, deviceRes, dateRes] = await Promise.all([
    queryPromise,
    countryPromise,
    devicePromise,
    datePromise,
  ]);

  if (!queryRes.ok) {
    if (queryRes.status === 403) {
      throw new Error(
        `PERMISSION_DENIED: Your authorized Google account does not have Search Console permissions for "${propertyUrl}".`
      );
    }
    const errText = await queryRes.text().catch(() => '');
    throw new Error(`GSC_API_ERROR: Google Search Console returned error (${queryRes.status}): ${errText}`);
  }

  const queryJson: any = await queryRes.json();
  const rawRows: any[] = Array.isArray(queryJson.rows) ? queryJson.rows : [];

  // Parse Query rows
  const rows: GSCQueryRow[] = rawRows.map((r) => ({
    query: String(r.keys?.[0] || '').trim(),
    page: String(r.keys?.[1] || '').trim(),
    clicks: Number(r.clicks || 0),
    impressions: Number(r.impressions || 0),
    ctr: Number(((Number(r.ctr) || 0) * 100).toFixed(2)),
    position: Number((Number(r.position) || 0).toFixed(1)),
  }));

  // Parse Countries
  let countries: GSCCountryRow[] = [];
  if (countryRes && countryRes.ok) {
    const cJson: any = await countryRes.json().catch(() => ({}));
    if (Array.isArray(cJson.rows)) {
      countries = cJson.rows.map((r: any) => {
        const code = String(r.keys?.[0] || '').toUpperCase();
        return {
          countryCode: code,
          countryName: getCountryFullName(code),
          clicks: Number(r.clicks || 0),
          impressions: Number(r.impressions || 0),
          ctr: Number(((Number(r.ctr) || 0) * 100).toFixed(2)),
          position: Number((Number(r.position) || 0).toFixed(1)),
        };
      });
      countries.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    }
  }

  // Parse Devices
  let devices: GSCDeviceRow[] = [];
  if (deviceRes && deviceRes.ok) {
    const dJson: any = await deviceRes.json().catch(() => ({}));
    if (Array.isArray(dJson.rows)) {
      devices = dJson.rows.map((r: any) => ({
        device: String(r.keys?.[0] || 'DESKTOP').toUpperCase(),
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr: Number(((Number(r.ctr) || 0) * 100).toFixed(2)),
        position: Number((Number(r.position) || 0).toFixed(1)),
      }));
      devices.sort((a, b) => b.clicks - a.clicks);
    }
  }

  // Parse Date trend
  let dateTrends: GSCDateTrendRow[] = [];
  if (dateRes && dateRes.ok) {
    const dtJson: any = await dateRes.json().catch(() => ({}));
    if (Array.isArray(dtJson.rows)) {
      dateTrends = dtJson.rows.map((r: any) => ({
        date: String(r.keys?.[0] || ''),
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr: Number(((Number(r.ctr) || 0) * 100).toFixed(2)),
        position: Number((Number(r.position) || 0).toFixed(1)),
      }));
      dateTrends.sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  // Aggregate Page report
  const pageMap = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      posSum: number;
      queries: { query: string; clicks: number; impressions: number; position: number }[];
    }
  >();

  for (const r of rows) {
    if (!r.page) continue;
    const item = pageMap.get(r.page) || {
      clicks: 0,
      impressions: 0,
      posSum: 0,
      queries: [],
    };
    item.clicks += r.clicks;
    item.impressions += r.impressions;
    item.posSum += r.position * r.impressions;
    if (r.query) {
      item.queries.push({
        query: r.query,
        clicks: r.clicks,
        impressions: r.impressions,
        position: r.position,
      });
    }
    pageMap.set(r.page, item);
  }

  const pages: GSCPageRow[] = Array.from(pageMap.entries()).map(([page, data]) => {
    const avgPos = data.impressions > 0 ? Number((data.posSum / data.impressions).toFixed(1)) : 0;
    const ctr = data.impressions > 0 ? Number(((data.clicks / data.impressions) * 100).toFixed(2)) : 0;
    const sortedQueries = [...data.queries].sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    return {
      page,
      clicks: data.clicks,
      impressions: data.impressions,
      ctr,
      position: avgPos,
      topQueries: sortedQueries.slice(0, 10),
    };
  });
  pages.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  // Compute Overall Totals
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalPosWeighted = 0;

  for (const r of rows) {
    totalClicks += r.clicks;
    totalImpressions += r.impressions;
    totalPosWeighted += r.position * r.impressions;
  }

  const avgCtr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
  const avgPosition = totalImpressions > 0 ? Number((totalPosWeighted / totalImpressions).toFixed(1)) : 0;

  // Position brackets
  const position1To3 = rows.filter((r) => r.position >= 1 && r.position <= 3.4);
  const position4To10 = rows.filter((r) => r.position > 3.4 && r.position <= 10.4);
  const position11To20 = rows.filter((r) => r.position > 10.4 && r.position <= 20.4);
  const position21To30 = rows.filter((r) => r.position > 20.4 && r.position <= 30.4);
  const position31Plus = rows.filter((r) => r.position > 30.4);

  // Deterministic Quick Wins & Low CTR
  const quickWins = rows
    .filter((r) => r.position >= 4 && r.position <= 10.4 && r.impressions >= 10)
    .sort((a, b) => b.impressions - a.impressions);

  const lowCtrOpportunities = rows
    .filter((r) => r.impressions >= 25 && r.position <= 15 && r.ctr < 2.5)
    .sort((a, b) => b.impressions - a.impressions);

  // Query -> Page Mapping & Overlap Detection
  const queryPagesMap = new Map<string, { pages: Set<string>; impressions: number; clicks: number }>();
  for (const r of rows) {
    if (!r.query || !r.page) continue;
    const entry = queryPagesMap.get(r.query) || { pages: new Set<string>(), impressions: 0, clicks: 0 };
    entry.pages.add(r.page);
    entry.impressions += r.impressions;
    entry.clicks += r.clicks;
    queryPagesMap.set(r.query, entry);
  }

  const cannibalizationSignals = Array.from(queryPagesMap.entries())
    .filter(([, v]) => v.pages.size > 1)
    .map(([query, v]) => ({
      query,
      pages: Array.from(v.pages),
      impressions: v.impressions,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);

  // Build Structured Opportunities List for Action Center
  const opportunities: GSCOpportunityItem[] = [];

  // 1. Quick Wins (Positions 4–10)
  for (const r of quickWins.slice(0, 8)) {
    opportunities.push({
      id: `gsc-qw-${encodeURIComponent(r.query).slice(0, 30)}`,
      type: 'QUICK_WIN_POS_4_10',
      title: `Page 1 Striking Distance: "${r.query}"`,
      query: r.query,
      page: r.page,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      position: r.position,
      opportunity: `Currently ranking at position ${r.position} with ${r.impressions} Search Console impressions. A modest push could achieve top 3 visibility.`,
      recommendedAction:
        'Improve title tag to feature exact keyword, add supporting FAQ/definitions, and build targeted internal links to this URL.',
    });
  }

  // 2. High Impression / Low CTR
  for (const r of lowCtrOpportunities.slice(0, 8)) {
    opportunities.push({
      id: `gsc-ctr-${encodeURIComponent(r.query).slice(0, 30)}`,
      type: 'HIGH_IMPRESSION_LOW_CTR',
      title: `Snippet CTR Underperformance: "${r.query}"`,
      query: r.query,
      page: r.page,
      impressions: r.impressions,
      clicks: r.clicks,
      ctr: r.ctr,
      position: r.position,
      opportunity: `Receiving ${r.impressions} impressions at position ${r.position}, but CTR is only ${r.ctr}%. Search snippet may lack intent match or call-to-action.`,
      recommendedAction:
        'Rewrite meta description with a direct answer or compelling outcome; align title tag more precisely to search intent.',
    });
  }

  // 3. Page 2 Striking Distance (Positions 11–20)
  for (const r of position11To20.slice(0, 6)) {
    if (r.impressions >= 15) {
      opportunities.push({
        id: `gsc-p2-${encodeURIComponent(r.query).slice(0, 30)}`,
        type: 'STRIKING_DISTANCE_POS_11_20',
        title: `Page 2 Breakthrough Candidate: "${r.query}"`,
        query: r.query,
        page: r.page,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr: r.ctr,
        position: r.position,
        opportunity: `Ranking on Page 2 (pos ${r.position}) with ${r.impressions} impressions. Google already considers this page relevant.`,
        recommendedAction:
          'Add a dedicated H2/H3 section addressing this query directly, refresh on-page content, and link from top pages.',
      });
    }
  }

  // 4. Overlap Opportunities
  for (const c of cannibalizationSignals.slice(0, 5)) {
    opportunities.push({
      id: `gsc-overlap-${encodeURIComponent(c.query).slice(0, 30)}`,
      type: 'POTENTIAL_OVERLAP',
      title: `Potential Query/Page Overlap: "${c.query}"`,
      query: c.query,
      page: c.pages[0],
      impressions: c.impressions,
      clicks: 0,
      ctr: 0,
      position: 0,
      pages: c.pages,
      opportunity: `Multiple URLs (${c.pages.length} pages) receive impressions for "${c.query}". This may divide ranking authority.`,
      recommendedAction:
        'Audit whether to consolidate into a single authoritative URL, or clarify topical distinction between pages with explicit internal anchors.',
    });
  }

  const isDomain = propertyUrl.startsWith('sc-domain:');

  return {
    propertyUrl,
    propertyType: isDomain ? 'Domain property' : 'URL-prefix property',
    dateRange: { startDate, endDate, preset: presetLabel },
    lastFetched: new Date().toISOString(),
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      avgCtr,
      avgPosition,
    },
    rows,
    pages,
    countries,
    devices,
    dateTrends,
    opportunities,
    quickWins,
    lowCtrOpportunities,
    position1To3,
    position4To10,
    position5To10: position4To10,
    position11To20,
    position21To30,
    position31Plus,
    cannibalizationSignals,
  };
}

/**
 * Generates CSV export content
 */
export function generateGscCsv(data: GSCSearchData, type: 'queries' | 'pages' | 'all'): string {
  if (type === 'pages') {
    const headers = ['Page URL', 'Clicks', 'Impressions', 'CTR (%)', 'Average Position', 'Top Query'];
    const lines = [headers.join(',')];
    for (const p of data.pages) {
      const topQ = p.topQueries[0]?.query || '';
      lines.push(
        `"${p.page.replace(/"/g, '""')}",${p.clicks},${p.impressions},${p.ctr},${p.position},"${topQ.replace(
          /"/g,
          '""'
        )}"`
      );
    }
    return lines.join('\n');
  }

  const headers = ['Query', 'Landing Page', 'Clicks', 'Impressions', 'CTR (%)', 'Average Position'];
  const lines = [headers.join(',')];
  for (const r of data.rows) {
    lines.push(
      `"${r.query.replace(/"/g, '""')}","${r.page.replace(/"/g, '""')}",${r.clicks},${r.impressions},${r.ctr},${
        r.position
      }`
    );
  }
  return lines.join('\n');
}
