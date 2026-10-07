import React, { useEffect, useState } from 'react';
import { Search, Settings, RefreshCw, ShieldCheck } from 'lucide-react';
import type {
  AIGrowthStrategy,
  AuditStage,
  GSCConnectionState,
  PrimaryGoal,
  SEOIssue,
  TargetMarket,
  TaskStatus,
  WebsiteAuditResult,
} from './types/seo';
import {
  disconnectGsc,
  fetchGscConnectionStatus,
  fetchGscSearchAnalytics,
  initiateGscOAuth,
  requestAiGrowthPlan,
  requestWebsiteAudit,
  selectGscProperty,
} from './services/api';
import {
  ContentIntelligenceSection,
  InternalLinkingSection,
  OnPageAuditSection,
  OverviewSection,
  PerformanceAndOffPageSection,
  StructuredDataSection,
  TechnicalAuditSection,
} from './components/AuditSections';
import {
  ActionCenterSection,
  AiGrowthEngineSection,
  SearchIntelligenceSection,
} from './components/SearchAndAiViews';
import { SearchConsoleDashboard } from './components/SearchConsoleDashboard';
import {
  AdvancedSettingsModal,
  ReAuditComparisonSection,
  SafeFixAndZipSection,
} from './components/FixerAndReauditViews';
import { SecurityStatusModal } from './components/SecurityStatusModal';

const TARGET_MARKETS: TargetMarket[] = [
  'Global',
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Pakistan',
  'India',
  'Custom',
];

const PRIMARY_GOALS: PrimaryGoal[] = [
  'Increase Organic Traffic',
  'Improve Rankings',
  'Generate Leads',
  'Increase Sales',
  'Improve Local Visibility',
  'Improve Technical SEO',
  'Improve Content Strategy',
];

const AUDIT_STAGES: AuditStage[] = [
  'Preparing URL',
  'Connecting to website',
  'Fetching page',
  'Analyzing technical SEO',
  'Analyzing metadata',
  'Analyzing content',
  'Checking links',
  'Checking structured data',
  'Checking indexability',
  'Building SEO report',
  'Generating recommendations',
];

export type DashboardTab =
  | 'overview'
  | 'gsc'
  | 'technical'
  | 'onpage'
  | 'content'
  | 'search-intel'
  | 'internal-links'
  | 'structured-data'
  | 'performance'
  | 'ai-growth'
  | 'action-center'
  | 'safe-fixes'
  | 'reaudit';

const DASHBOARD_TABS: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'SEO Health Overview' },
  { id: 'gsc', label: 'Google Search Console' },
  { id: 'technical', label: 'Technical SEO' },
  { id: 'onpage', label: 'On-Page SEO' },
  { id: 'content', label: 'Content Intelligence' },
  { id: 'search-intel', label: 'Search Intelligence' },
  { id: 'internal-links', label: 'Internal Linking' },
  { id: 'structured-data', label: 'Structured Data' },
  { id: 'performance', label: 'Performance & Off-Page' },
  { id: 'ai-growth', label: 'AI Growth Engine' },
  { id: 'action-center', label: 'SEO Action Center' },
  { id: 'safe-fixes', label: 'Safe Fixes & ZIP' },
  { id: 'reaudit', label: 'Re-Audit & Verify' },
];

export function App() {
  const [urlInput, setUrlInput] = useState('https://example.com');
  const [targetMarket, setTargetMarket] = useState<TargetMarket>('Global');
  const [customMarket, setCustomMarket] = useState('');
  const [primaryGoal, setPrimaryGoal] = useState<PrimaryGoal>('Increase Organic Traffic');
  const [crawlMode, setCrawlMode] = useState<'single' | 'multi'>('single');

  const [isAuditing, setIsAuditing] = useState(false);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [currentAudit, setCurrentAudit] = useState<WebsiteAuditResult | null>(null);
  const [previousAudit, setPreviousAudit] = useState<WebsiteAuditResult | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  const [aiStrategy, setAiStrategy] = useState<AIGrowthStrategy | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const [gscState, setGscState] = useState<GSCConnectionState>({
    status: 'Not Connected',
    oauthConfigured: false,
    properties: [],
    message: 'Google Search Console is not connected. Mode B (AI-derived opportunities from observed website HTML) is active.',
  });
  const [isLoadingGsc, setIsLoadingGsc] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  useEffect(() => {
    fetchGscConnectionStatus()
      .then((st) => setGscState(st))
      .catch(() => {});

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GSC_CONNECTED') {
        handleRefreshGscStatus();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRefreshGscStatus = async (selectedProp?: string) => {
    setIsLoadingGsc(true);
    try {
      const st = await fetchGscConnectionStatus();
      if (st.status === 'Connected') {
        const propToQuery = selectedProp || (st.properties.length > 0 ? st.properties[0].siteUrl : undefined);
        const analytics = await fetchGscSearchAnalytics({ propertyUrl: propToQuery });
        setGscState({
          ...st,
          status: analytics.status || st.status,
          selectedProperty: propToQuery,
          data: analytics.data,
          message: analytics.message || st.message,
        });
      } else {
        setGscState(st);
      }
    } finally {
      setIsLoadingGsc(false);
    }
  };

  const handleSelectGscProperty = async (propertyUrl: string) => {
    setIsLoadingGsc(true);
    try {
      await selectGscProperty(propertyUrl);
      await handleRefreshGscStatus(propertyUrl);
    } finally {
      setIsLoadingGsc(false);
    }
  };

  const handleFetchGscData = async (params: {
    propertyUrl?: string;
    preset?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    setIsLoadingGsc(true);
    try {
      const analytics = await fetchGscSearchAnalytics(params);
      setGscState((prev) => ({
        ...prev,
        status: analytics.status || prev.status,
        selectedProperty: params.propertyUrl || prev.selectedProperty,
        data: analytics.data || prev.data,
        message: analytics.message || prev.message,
      }));
    } finally {
      setIsLoadingGsc(false);
    }
  };

  const handleDisconnectGsc = async () => {
    setIsLoadingGsc(true);
    try {
      const st = await disconnectGsc();
      setGscState(st);
    } finally {
      setIsLoadingGsc(false);
    }
  };

  const handleConnectGsc = async () => {
    setIsLoadingGsc(true);
    try {
      if (gscState.status === 'Connected') {
        await handleRefreshGscStatus(gscState.selectedProperty);
        return;
      }
      const res = await initiateGscOAuth();
      if (res.authUrl) {
        const width = 580;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
          res.authUrl,
          'zyvenseo_gsc_auth',
          `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
        );
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.location.href = res.authUrl;
        }
      } else if (res.message) {
        setGscState((prev) => ({
          ...prev,
          status: 'Permission Required',
          message: res.message!,
        }));
      }
    } finally {
      setIsLoadingGsc(false);
    }
  };

  const handleAuditGscPage = async (pageUrl: string) => {
    setUrlInput(pageUrl);
    setActiveTab('overview');
    await executeAudit({ overrideUrl: pageUrl });
  };

  const handleAddGscActionTask = (task: {
    title: string;
    category: string;
    priority: 'P0 Critical' | 'P1 High' | 'P2 Medium' | 'P3 Low';
    evidence: string;
    recommendedAction: string;
  }) => {
    const newIssue: SEOIssue = {
      id: `gsc-act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: 'On-Page',
      severity: task.priority === 'P0 Critical' ? 'CRITICAL' : task.priority === 'P1 High' ? 'HIGH' : 'MEDIUM',
      title: task.title,
      description: task.recommendedAction,
      evidence: task.evidence,
      whyItMatters: 'Verified directly in Google Search Console search analytics.',
      recommendation: task.recommendedAction,
      recommendedFix: task.recommendedAction,
      affectedUrl: urlInput,
      difficulty: 'Medium',
      impactCategory: 'High',
      safetyClassification: 'REVIEW REQUIRED',
      autoFixable: false,
      requiresReview: true,
      dataSource: 'GOOGLE_SEARCH_CONSOLE',
      fixPrompt: `Optimize page for query: ${task.title}. ${task.recommendedAction}`,
      taskStatus: 'Pending',
    };

    setCurrentAudit((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        issues: [newIssue, ...prev.issues],
      };
    });
  };

  const executeAudit = async (options?: {
    overrideUrl?: string;
    autoGenerateAiPlan?: boolean;
    preservePreviousForDiff?: boolean;
  }) => {
    const targetUrl = (options?.overrideUrl ?? urlInput).trim();
    if (!targetUrl) {
      setAuditError('Invalid URL: Please enter a public website URL (e.g., https://example.com).');
      return;
    }

    setAuditError(null);
    setIsAuditing(true);
    setActiveStageIndex(0);

    // Advance operational stage indicators while the network audit & DOM parser run
    const stageInterval = setInterval(() => {
      setActiveStageIndex((prev) => (prev < AUDIT_STAGES.length - 2 ? prev + 1 : prev));
    }, 320);

    try {
      const result = await requestWebsiteAudit({
        url: targetUrl,
        targetMarket,
        customMarket: targetMarket === 'Custom' ? customMarket : undefined,
        primaryGoal,
        crawlMode,
      });

      clearInterval(stageInterval);
      setActiveStageIndex(AUDIT_STAGES.length - 1);

      if (options?.preservePreviousForDiff && currentAudit) {
        setPreviousAudit(currentAudit);
      } else if (!options?.preservePreviousForDiff) {
        setPreviousAudit(null);
      }

      setCurrentAudit(result);
      setAiStrategy(null);

      if (options?.autoGenerateAiPlan) {
        setActiveTab('ai-growth');
        setIsGeneratingAi(true);
        try {
          const plan = await requestAiGrowthPlan(result, gscState.data);
          setAiStrategy(plan);
        } finally {
          setIsGeneratingAi(false);
        }
      } else if (!options?.preservePreviousForDiff) {
        setActiveTab('overview');
      }
    } catch (err: any) {
      clearInterval(stageInterval);
      setAuditError(
        err.message || 'Unable to complete website audit. Check the URL and verify the website allows public requests.'
      );
    } finally {
      setIsAuditing(false);
    }
  };

  const handleGenerateAiPlanOnly = async () => {
    if (!currentAudit) {
      await executeAudit({ autoGenerateAiPlan: true });
      return;
    }
    setActiveTab('ai-growth');
    setIsGeneratingAi(true);
    try {
      const plan = await requestAiGrowthPlan(currentAudit, gscState.data);
      setAiStrategy(plan);
    } catch (err: any) {
      setAuditError(err.message || 'AI SEO Growth Engine could not complete the request.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleUpdateTaskStatus = (issueId: string, newStatus: TaskStatus) => {
    if (!currentAudit) return;
    setCurrentAudit({
      ...currentAudit,
      issues: currentAudit.issues.map((i) => (i.id === issueId ? { ...i, taskStatus: newStatus } : i)),
    });
  };

  const handleMarkFixesApplied = (appliedFixIds: string[]) => {
    if (!currentAudit) return;
    setCurrentAudit({
      ...currentAudit,
      issues: currentAudit.issues.map((i) =>
        i.proposedFix && appliedFixIds.includes(i.proposedFix.id)
          ? { ...i, taskStatus: 'Applied' }
          : i
      ),
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100">
      {/* Top Bar Contract: Strictly 3 zones (Brand wordmark | 4-5 nav links | 1-2 primary actions) */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800/90 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#analyzer"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap"
        >
          ZyvenSEO AI
        </a>

        {/* Zone 2: clean text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <button
            type="button"
            onClick={() => {
              if (currentAudit) setActiveTab('overview');
              else window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="hover:text-emerald-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
          >
            Website Analyzer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gsc')}
            className="inline-flex items-center gap-1.5 hover:text-emerald-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>Search Console</span>
            {gscState.status === 'Connected' ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentAudit) setActiveTab('technical');
            }}
            className="hover:text-emerald-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
          >
            Technical Audit
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentAudit) setActiveTab('content');
            }}
            className="hover:text-emerald-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
          >
            Content Intelligence
          </button>
          <button
            type="button"
            onClick={() => {
              if (currentAudit) setActiveTab('ai-growth');
            }}
            className="hover:text-emerald-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
          >
            AI Growth Engine
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('safe-fixes')}
            className="hover:text-emerald-400 hover:underline underline-offset-4 transition-colors whitespace-nowrap cursor-pointer"
          >
            Source ZIP Fixer
          </button>
        </nav>

        {/* Zone 3: 2 primary actions + Security Status */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSecurityModalOpen(true)}
            aria-label="Security Status & Threat Model"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/70 border border-emerald-800/60 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Security Hardened</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Advanced Settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-slate-100 bg-slate-900 border border-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Settings</span>
          </button>
          <button
            type="button"
            onClick={() => executeAudit({})}
            disabled={isAuditing}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            {isAuditing ? 'Auditing...' : 'Analyze Website'}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Hero / Primary Website URL Analyzer */}
        <section
          id="analyzer"
          aria-labelledby="hero-heading"
          className="bg-[#111827] border border-slate-800/90 rounded-xl p-6 sm:p-8"
        >
          <div className="max-w-3xl space-y-2">
            <div className="text-xs font-medium text-emerald-400 tracking-wide">
              Universal Website SEO Optimizer · Analyze. Optimize. Fix. Grow.
            </div>
            <h1
              id="hero-heading"
              className="text-2xl sm:text-3xl font-bold text-slate-100 font-display tracking-tight"
            >
              ZyvenSEO AI — Universal Website SEO Optimizer
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
              Analyze any public website and discover technical SEO issues, on-page weaknesses, content opportunities, indexability problems, structured-data issues and growth opportunities.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeAudit({});
            }}
            className="mt-6 space-y-4"
          >
            {/* URL Input + Primary / Secondary CTAs */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
              <div className="relative flex-1">
                <label htmlFor="website-url-input" className="sr-only">
                  Website URL
                </label>
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="website-url-input"
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-400 rounded-lg pl-10 pr-4 py-3 text-sm text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none transition-colors"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <button
                  type="submit"
                  disabled={isAuditing}
                  className="px-6 py-3 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {isAuditing ? 'Analyzing Website...' : 'Analyze Website'}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateAiPlanOnly}
                  disabled={isAuditing || isGeneratingAi}
                  className="px-5 py-3 text-sm font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Generate AI SEO Plan
                </button>
              </div>
            </div>

            {/* Selectors: Target Market, Primary Goal, Crawl Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
              <div>
                <label htmlFor="target-market-select" className="block text-xs text-slate-400 mb-1">
                  Target Market
                </label>
                <select
                  id="target-market-select"
                  value={targetMarket}
                  onChange={(e) => setTargetMarket(e.target.value as TargetMarket)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {TARGET_MARKETS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {targetMarket === 'Custom' && (
                <div>
                  <label htmlFor="custom-market-input" className="block text-xs text-slate-400 mb-1">
                    Custom Market / Region
                  </label>
                  <input
                    id="custom-market-input"
                    type="text"
                    value={customMarket}
                    onChange={(e) => setCustomMarket(e.target.value)}
                    placeholder="e.g. Germany, UAE, Southeast Asia"
                    className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div>
                <label htmlFor="primary-goal-select" className="block text-xs text-slate-400 mb-1">
                  Primary SEO Goal
                </label>
                <select
                  id="primary-goal-select"
                  value={primaryGoal}
                  onChange={(e) => setPrimaryGoal(e.target.value as PrimaryGoal)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  {PRIMARY_GOALS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="crawl-mode-select" className="block text-xs text-slate-400 mb-1">
                  Crawl Scope
                </label>
                <select
                  id="crawl-mode-select"
                  value={crawlMode}
                  onChange={(e) => setCrawlMode(e.target.value as 'single' | 'multi')}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="single">Lightweight Single-Page Audit (Default)</option>
                  <option value="multi">Multi-Page Sample Crawl (Up to 5 Internal Pages)</option>
                </select>
              </div>
            </div>

            {/* Quick Public Website Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
              <span>Quick-test public websites:</span>
              {['https://example.com', 'https://www.wikipedia.org', 'https://developer.mozilla.org'].map(
                (sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setUrlInput(sample);
                      executeAudit({ overrideUrl: sample });
                    }}
                    className="font-mono text-[11px] text-slate-300 hover:text-emerald-400 underline underline-offset-4 cursor-pointer"
                  >
                    {sample.replace(/^https?:\/\//, '')}
                  </button>
                )
              )}
            </div>

            {/* Google Search Console Status Bar */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-300">Google Search Console:</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                    gscState.status === 'Connected'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {gscState.status === 'Connected' ? '✓ ' : ''}{gscState.status}
                </span>
                {gscState.status === 'Connected' && gscState.selectedProperty && (
                  <span className="text-slate-400 font-mono text-[11px]">
                    · {gscState.selectedProperty}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('safe-fixes')}
                  className="text-slate-300 hover:text-emerald-400 hover:underline cursor-pointer font-medium"
                >
                  Fix Website Source / ZIP →
                </button>
                <span className="text-slate-700 hidden sm:inline" aria-hidden="true">|</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('gsc')}
                  className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer font-medium"
                >
                  {gscState.status === 'Connected'
                    ? 'Open Search Console Dashboard →'
                    : 'Connect Google Search Console →'}
                </button>
              </div>
            </div>
          </form>

          {/* Standalone Google Search Console View (when no website audit has been run yet) */}
          {!currentAudit && activeTab === 'gsc' && (
            <div className="mt-8 pt-8 border-t border-slate-800/90 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-100">
                  Google Search Console Intelligence
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Back to Analyzer
                </button>
              </div>
              <SearchConsoleDashboard
                gscState={gscState}
                onConnectGsc={handleConnectGsc}
                onDisconnectGsc={handleDisconnectGsc}
                onSelectProperty={handleSelectGscProperty}
                onFetchData={handleFetchGscData}
                isLoading={isLoadingGsc}
                auditedUrl={urlInput}
                onAuditPage={handleAuditGscPage}
                onAddActionTask={handleAddGscActionTask}
              />
            </div>
          )}

          {/* Standalone Website Source / ZIP Fixer View (when no website audit has been run yet) */}
          {!currentAudit && activeTab === 'safe-fixes' && (
            <div className="mt-8 pt-8 border-t border-slate-800/90 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">
                    Website Source / ZIP Fixer
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Inspect your website codebase archive, detect framework SEO entry points, review diffs, and generate a safe corrected ZIP.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Back to Analyzer
                </button>
              </div>
              <SafeFixAndZipSection />
            </div>
          )}

          {/* Accessible Form Error State */}
          {auditError && (
            <div
              role="alert"
              className="mt-5 p-4 bg-rose-950/50 border border-rose-800/80 rounded-lg text-xs text-rose-200 space-y-1"
            >
              <div className="font-semibold text-rose-300">Audit Could Not Complete</div>
              <p>{auditError}</p>
            </div>
          )}

          {/* Real Stage-Based Loading Experience (No Fake Percentages) */}
          {isAuditing && (
            <div
              aria-live="polite"
              className="mt-6 pt-6 border-t border-slate-800/80 space-y-4"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-400 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Current Operation: {AUDIT_STAGES[activeStageIndex]}</span>
                </span>
                <span className="font-mono text-slate-400">
                  Stage {activeStageIndex + 1} of {AUDIT_STAGES.length}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px] font-mono">
                {AUDIT_STAGES.map((stage, idx) => {
                  const isDone = idx < activeStageIndex;
                  const isCurrent = idx === activeStageIndex;
                  return (
                    <div
                      key={stage}
                      className={`px-2.5 py-2 rounded border ${
                        isCurrent
                          ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 font-semibold'
                          : isDone
                          ? 'bg-slate-900/70 border-slate-800 text-slate-300'
                          : 'bg-slate-950/50 border-slate-900 text-slate-600'
                      }`}
                    >
                      {isDone ? '✓ ' : isCurrent ? '→ ' : '· '}
                      {stage}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Dashboard View After Audit */}
        {currentAudit && !isAuditing && (
          <div className="space-y-6">
            {/* Top Diagnostic Summary Bar */}
            <section
              aria-label="Diagnostic Score Summary"
              className="bg-[#111827] border border-slate-800/90 rounded-xl p-5 sm:p-6 space-y-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span>Audited Website:</span>
                    <strong className="font-mono text-slate-100">{currentAudit.finalUrl}</strong>
                    <span aria-hidden="true">·</span>
                    <span>Market: {currentAudit.targetMarket}</span>
                    <span aria-hidden="true">·</span>
                    <span>Goal: {currentAudit.primaryGoal}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">
                      {new Date(currentAudit.auditDate).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-amber-300">
                    {currentAudit.scores.label}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-mono shrink-0">
                  <span className="text-rose-400 font-semibold">
                    Critical: {currentAudit.counts.critical}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400 font-semibold">
                    High: {currentAudit.counts.high}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-yellow-300">
                    Medium: {currentAudit.counts.medium}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-400">
                    Low: {currentAudit.counts.low}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-semibold">
                    Passed: {currentAudit.counts.passed}
                  </span>
                </div>
              </div>

              {/* Evidence-Based Diagnostic Score Breakdown (Prompt 2 Section 20) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                {[
                  { label: 'Overall Health', val: currentAudit.scores.overall, weight: 'Formula', primary: true },
                  { label: 'Technical & Index', val: currentAudit.scores.technicalIndexability ?? currentAudit.scores.technical ?? 0, weight: '30%' },
                  { label: 'On-Page & Headings', val: currentAudit.scores.onPageHeadings ?? currentAudit.scores.onPage ?? 0, weight: '25%' },
                  { label: 'Content & Keywords', val: currentAudit.scores.contentKeywords ?? currentAudit.scores.content ?? 0, weight: '20%' },
                  { label: 'Mobile & Speed', val: currentAudit.scores.mobilePerformance ?? currentAudit.scores.performance ?? 0, weight: '15%' },
                  { label: 'Social & Schema', val: currentAudit.scores.socialStructuredData ?? currentAudit.scores.structuredData ?? 0, weight: '10%' },
                ].map((m) => {
                  const val = m.val ?? 0;
                  const color =
                    val >= 80
                      ? 'text-emerald-400'
                      : val >= 60
                      ? 'text-amber-400'
                      : 'text-rose-400';
                  return (
                    <div
                      key={m.label}
                      className={`${
                        m.primary ? 'sm:border-r sm:border-slate-800 sm:pr-4' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 block truncate">{m.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{m.weight}</span>
                      </div>
                      <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${color}`}>
                        {val}
                        <span className="text-xs text-slate-500 font-normal">/100</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {currentAudit.scores.formulaBreakdown && (
                <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
                  <span className="text-slate-500">Diagnostic Formula: </span>
                  {currentAudit.scores.formulaBreakdown}
                </div>
              )}
            </section>

            {/* Dashboard Module Navigation Tabs */}
            <nav
              aria-label="SEO Audit Modules"
              className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-800"
            >
              {DASHBOARD_TABS.map((t) => {
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`px-3.5 py-2.5 text-xs font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'border-emerald-400 text-emerald-400 bg-slate-900/70'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* Active Module Viewport */}
            <div className="min-h-[420px]">
              {activeTab === 'overview' && (
                <OverviewSection
                  audit={currentAudit}
                  onNavigateTab={(tab) => setActiveTab(tab as DashboardTab)}
                />
              )}
              {activeTab === 'gsc' && (
                <SearchConsoleDashboard
                  gscState={gscState}
                  onConnectGsc={handleConnectGsc}
                  onDisconnectGsc={handleDisconnectGsc}
                  onSelectProperty={handleSelectGscProperty}
                  onFetchData={handleFetchGscData}
                  isLoading={isLoadingGsc}
                  auditedUrl={currentAudit.finalUrl}
                  onAuditPage={handleAuditGscPage}
                  onAddActionTask={handleAddGscActionTask}
                />
              )}
              {activeTab === 'technical' && <TechnicalAuditSection audit={currentAudit} />}
              {activeTab === 'onpage' && <OnPageAuditSection audit={currentAudit} />}
              {activeTab === 'content' && <ContentIntelligenceSection audit={currentAudit} />}
              {activeTab === 'search-intel' && (
                <SearchIntelligenceSection
                  audit={currentAudit}
                  gscState={gscState}
                  onConnectGsc={handleConnectGsc}
                  onSelectGscProperty={(prop) => handleRefreshGscStatus(prop)}
                  isLoadingGsc={isLoadingGsc}
                />
              )}
              {activeTab === 'internal-links' && <InternalLinkingSection audit={currentAudit} />}
              {activeTab === 'structured-data' && <StructuredDataSection audit={currentAudit} />}
              {activeTab === 'performance' && (
                <PerformanceAndOffPageSection audit={currentAudit} />
              )}
              {activeTab === 'ai-growth' && (
                <AiGrowthEngineSection
                  audit={currentAudit}
                  strategy={aiStrategy}
                  isGenerating={isGeneratingAi}
                  onGenerate={handleGenerateAiPlanOnly}
                />
              )}
              {activeTab === 'action-center' && (
                <ActionCenterSection
                  issues={currentAudit.issues}
                  onUpdateStatus={handleUpdateTaskStatus}
                />
              )}
              {activeTab === 'safe-fixes' && (
                <SafeFixAndZipSection
                  audit={currentAudit}
                  onMarkFixesApplied={handleMarkFixesApplied}
                />
              )}
              {activeTab === 'reaudit' && (
                <ReAuditComparisonSection
                  currentAudit={currentAudit}
                  previousAudit={previousAudit}
                  onTriggerReAudit={(verifyUrl) =>
                    executeAudit({ overrideUrl: verifyUrl, preservePreviousForDiff: true })
                  }
                  isAuditing={isAuditing}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Quiet, Authentic Footer (No Fake Telemetry Tickers) */}
      <footer className="border-t border-slate-800/80 px-4 sm:px-8 py-6 mt-12">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            ZyvenSEO AI — Universal Website SEO Optimizer. Dedicated strictly to website technical, on-page, content, and structural SEO.
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsSecurityModalOpen(true)}
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Security & Threat Model Audit</span>
            </button>
            <span aria-hidden="true">·</span>
            <span>Zero Fabricated Analytics Policy</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="hover:text-slate-300 cursor-pointer"
            >
              Advanced Settings
            </button>
          </div>
        </div>
      </footer>

      <AdvancedSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <SecurityStatusModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />
    </div>
  );
}

export default App;
