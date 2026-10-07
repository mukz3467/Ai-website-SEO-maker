import type {
  AIGrowthStrategy,
  GSCConnectionState,
  GSCSearchData,
  PrimaryGoal,
  TargetMarket,
  WebsiteAuditResult,
} from '../types/seo';

const STORAGE_KEY_API_BASE = 'zyvenseo_custom_api_base';

export function getApiBaseUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_API_BASE)?.trim().replace(/\/$/, '') || '';
  } catch {
    return '';
  }
}

export function setApiBaseUrl(url: string): void {
  try {
    const clean = url.trim().replace(/\/$/, '');
    if (!clean) {
      localStorage.removeItem(STORAGE_KEY_API_BASE);
    } else {
      localStorage.setItem(STORAGE_KEY_API_BASE, clean);
    }
  } catch {
    // ignore storage errors
  }
}

function resolveEndpoint(path: string): string {
  const base = getApiBaseUrl();
  return `${base}${path}`;
}

export async function requestWebsiteAudit(params: {
  url: string;
  targetMarket: TargetMarket;
  customMarket?: string;
  primaryGoal: PrimaryGoal;
  crawlMode: 'single' | 'multi';
}): Promise<WebsiteAuditResult> {
  const res = await fetch(resolveEndpoint('/api/audit'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.audit) {
    const userMessage = data?.error?.userMessage || 'Unable to Complete Website Audit';
    const technicalHint =
      data?.error?.technicalHint || 'Please check the website URL and verify that it is publicly accessible.';
    throw new Error(`${userMessage}: ${technicalHint}`);
  }

  return data.audit as WebsiteAuditResult;
}

export async function requestAiGrowthPlan(
  audit: WebsiteAuditResult,
  gscData?: GSCSearchData | null
): Promise<AIGrowthStrategy> {
  const res = await fetch(resolveEndpoint('/api/ai'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audit, gscData }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.strategy) {
    const hint = data?.error?.technicalHint || 'Unable to generate AI SEO strategy at this time.';
    throw new Error(hint);
  }

  return data.strategy as AIGrowthStrategy;
}

export async function requestApplySafeHtmlFixes(params: {
  rawHtml: string;
  approvedFixIds: string[];
  audit: WebsiteAuditResult;
}): Promise<{ updatedHtml: string; appliedChanges: { id: string; description: string }[] }> {
  const res = await fetch(resolveEndpoint('/api/fix'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.updatedHtml) {
    throw new Error(data?.error?.technicalHint || 'Failed to apply HTML fixes.');
  }

  return data;
}

export async function fetchGscConnectionStatus(): Promise<GSCConnectionState> {
  const res = await fetch(resolveEndpoint('/api/search-console/status'), {
    credentials: 'include',
  });
  if (!res.ok) {
    return {
      status: 'Data Unavailable',
      oauthConfigured: false,
      properties: [],
      message: 'Unable to check Search Console connection status.',
    };
  }
  return res.json();
}

export async function initiateGscOAuth(): Promise<{ authUrl?: string; message?: string }> {
  const res = await fetch(resolveEndpoint('/api/search-console/auth'), {
    credentials: 'include',
  });
  return res.json();
}

export async function selectGscProperty(propertyUrl: string): Promise<{ status: GSCConnectionState['status']; selectedProperty?: string; message?: string }> {
  const res = await fetch(resolveEndpoint('/api/search-console/select-property'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ propertyUrl }),
  });
  return res.json();
}

export async function fetchGscSearchAnalytics(params: {
  propertyUrl?: string;
  preset?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ status: GSCConnectionState['status']; data?: GSCSearchData; message?: string }> {
  const res = await fetch(resolveEndpoint('/api/search-console/data'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function disconnectGsc(): Promise<GSCConnectionState> {
  const res = await fetch(resolveEndpoint('/api/search-console/disconnect'), {
    method: 'POST',
    credentials: 'include',
  });
  return res.json();
}

export function getGscExportUrl(type: 'queries' | 'pages' | 'all'): string {
  return resolveEndpoint(`/api/search-console/export?type=${type}`);
}

export async function fetchSecurityAuditReport(): Promise<{
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  overallStatus: 'SECURE' | 'NEEDS REVIEW';
  results: Array<{
    id: number;
    name: string;
    category: string;
    vector: string;
    expectedResult: string;
    actualStatus: 'PASSED' | 'FAILED';
    evidence: string;
  }>;
}> {
  const res = await fetch(resolveEndpoint('/api/security/audit-status'));
  if (!res.ok) {
    throw new Error('Failed to retrieve security audit report.');
  }
  return res.json();
}
