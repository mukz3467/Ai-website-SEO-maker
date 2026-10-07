import React, { useState, useMemo } from 'react';
import {
  Search,
  ExternalLink,
  Download,
  RefreshCw,
  Unlink,
  Check,
  AlertTriangle,
  Info,
  TrendingUp,
  Globe,
  Smartphone,
  Layers,
  Sparkles,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  XCircle,
  PlusCircle,
} from 'lucide-react';
import type {
  GSCConnectionState,
  GSCOpportunityItem,
  GSCProperty,
  GSCSearchData,
} from '../types/seo';
import { getGscExportUrl } from '../services/api';

interface SearchConsoleDashboardProps {
  gscState: GSCConnectionState;
  onConnectGsc: () => void;
  onDisconnectGsc: () => void;
  onSelectProperty: (propertyUrl: string) => void;
  onFetchData: (params: { propertyUrl?: string; preset?: string; startDate?: string; endDate?: string }) => void;
  isLoading: boolean;
  auditedUrl?: string;
  onAuditPage?: (pageUrl: string) => void;
  onAddActionTask?: (task: {
    title: string;
    category: string;
    priority: 'P0 Critical' | 'P1 High' | 'P2 Medium' | 'P3 Low';
    evidence: string;
    recommendedAction: string;
  }) => void;
}

type GSCTab =
  | 'queries'
  | 'pages'
  | 'quick-wins'
  | 'ctr-opps'
  | 'brackets'
  | 'overlap'
  | 'geography'
  | 'trends';

const DATE_PRESETS = [
  { id: '7d', label: 'Last 7 days' },
  { id: '28d', label: 'Last 28 days (Default)' },
  { id: '3m', label: 'Last 3 months' },
  { id: '6m', label: 'Last 6 months' },
  { id: 'custom', label: 'Custom range' },
];

export const SearchConsoleDashboard: React.FC<SearchConsoleDashboardProps> = ({
  gscState,
  onConnectGsc,
  onDisconnectGsc,
  onSelectProperty,
  onFetchData,
  isLoading,
  auditedUrl,
  onAuditPage,
  onAddActionTask,
}) => {
  const [activeTab, setActiveTab] = useState<GSCTab>('queries');
  const [selectedPreset, setSelectedPreset] = useState<string>('28d');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [querySearch, setQuerySearch] = useState('');
  const [pageSearch, setPageSearch] = useState('');
  const [queryPage, setQueryPage] = useState(1);
  const [pagePage, setPagePage] = useState(1);
  const [sortByQuery, setSortByQuery] = useState<'clicks' | 'impressions' | 'ctr' | 'position'>('clicks');
  const [sortOrderQuery, setSortOrderQuery] = useState<'asc' | 'desc'>('desc');
  const [sortByPage, setSortByPage] = useState<'clicks' | 'impressions' | 'ctr' | 'position'>('clicks');
  const [sortOrderPage, setSortOrderPage] = useState<'asc' | 'desc'>('desc');
  const [addedTasks, setAddedTasks] = useState<Record<string, boolean>>({});
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);

  const isConnected = gscState.status === 'Connected';
  const data: GSCSearchData | undefined = gscState.data;

  // Identify recommended matching property based on current audited URL
  const recommendedProperty = useMemo(() => {
    if (!auditedUrl || !gscState.properties.length) return null;
    try {
      const parsed = new URL(auditedUrl);
      const host = parsed.hostname.toLowerCase();
      const cleanHost = host.replace(/^www\./, '');

      return (
        gscState.properties.find(
          (p) =>
            p.siteUrl.toLowerCase() === `sc-domain:${cleanHost}` ||
            p.siteUrl.toLowerCase().startsWith(`http://${cleanHost}`) ||
            p.siteUrl.toLowerCase().startsWith(`https://${cleanHost}`) ||
            p.siteUrl.toLowerCase().includes(cleanHost)
        ) || null
      );
    } catch {
      return null;
    }
  }, [auditedUrl, gscState.properties]);

  const handleApplyDateRange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset === 'custom') {
      if (customStart && customEnd) {
        onFetchData({
          propertyUrl: gscState.selectedProperty,
          preset: 'custom',
          startDate: customStart,
          endDate: customEnd,
        });
      }
    } else {
      onFetchData({
        propertyUrl: gscState.selectedProperty,
        preset,
      });
    }
  };

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) return;
    if (new Date(customStart) > new Date(customEnd)) return;
    onFetchData({
      propertyUrl: gscState.selectedProperty,
      preset: 'custom',
      startDate: customStart,
      endDate: customEnd,
    });
  };

  const handleAddToActions = (task: {
    id: string;
    title: string;
    category: string;
    priority: 'P0 Critical' | 'P1 High' | 'P2 Medium' | 'P3 Low';
    evidence: string;
    recommendedAction: string;
  }) => {
    if (onAddActionTask) {
      onAddActionTask({
        title: task.title,
        category: task.category,
        priority: task.priority,
        evidence: task.evidence,
        recommendedAction: task.recommendedAction,
      });
      setAddedTasks((prev) => ({ ...prev, [task.id]: true }));
      setTimeout(() => {
        setAddedTasks((prev) => ({ ...prev, [task.id]: false }));
      }, 2500);
    }
  };

  // Filtered & sorted queries
  const filteredQueries = useMemo(() => {
    if (!data?.rows) return [];
    let list = data.rows;
    if (querySearch.trim()) {
      const q = querySearch.toLowerCase();
      list = list.filter((r) => r.query.toLowerCase().includes(q) || r.page.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const factor = sortOrderQuery === 'asc' ? 1 : -1;
      if (sortByQuery === 'clicks') return (a.clicks - b.clicks) * factor;
      if (sortByQuery === 'impressions') return (a.impressions - b.impressions) * factor;
      if (sortByQuery === 'ctr') return (a.ctr - b.ctr) * factor;
      if (sortByQuery === 'position') return (a.position - b.position) * factor;
      return 0;
    });
  }, [data?.rows, querySearch, sortByQuery, sortOrderQuery]);

  // Filtered & sorted pages
  const filteredPages = useMemo(() => {
    if (!data?.pages) return [];
    let list = data.pages;
    if (pageSearch.trim()) {
      const q = pageSearch.toLowerCase();
      list = list.filter((p) => p.page.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const factor = sortOrderPage === 'asc' ? 1 : -1;
      if (sortByPage === 'clicks') return (a.clicks - b.clicks) * factor;
      if (sortByPage === 'impressions') return (a.impressions - b.impressions) * factor;
      if (sortByPage === 'ctr') return (a.ctr - b.ctr) * factor;
      if (sortByPage === 'position') return (a.position - b.position) * factor;
      return 0;
    });
  }, [data?.pages, pageSearch, sortByPage, sortOrderPage]);

  const itemsPerPage = 15;
  const paginatedQueries = filteredQueries.slice((queryPage - 1) * itemsPerPage, queryPage * itemsPerPage);
  const totalQueryPages = Math.ceil(filteredQueries.length / itemsPerPage) || 1;

  const paginatedPages = filteredPages.slice((pagePage - 1) * itemsPerPage, pagePage * itemsPerPage);
  const totalPagePages = Math.ceil(filteredPages.length / itemsPerPage) || 1;

  return (
    <div className="space-y-6">
      {/* 1. Header & Connection Bar */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Connection Status:</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : gscState.status === 'Connecting...'
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                    : gscState.status === 'Permission Required'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {isConnected && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                {gscState.status}
              </span>

              {isConnected && (
                <span className="text-xs text-slate-400 font-mono">
                  · Scope: <code className="text-slate-300">webmasters.readonly</code>
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              {isConnected
                ? 'Google Search Console Connected. Real impressions, clicks, CTR, and keyword rankings retrieved directly from verified Google Search Analytics API.'
                : gscState.message}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => onFetchData({ propertyUrl: gscState.selectedProperty, preset: selectedPreset })}
                  disabled={isLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
                  Refresh Data
                </button>

                <button
                  type="button"
                  onClick={() => setShowDisconnectModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/50 rounded-md transition-colors cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onConnectGsc}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Checking Authorization...' : 'Connect Google Search Console'}
              </button>
            )}
          </div>
        </div>

        {/* OAuth Configuration Help (if not configured on server) */}
        {!gscState.oauthConfigured && !isConnected && (
          <div className="mt-4 p-4 bg-amber-950/20 border border-amber-800/40 rounded-lg text-xs space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-semibold">
              <Info className="w-4 h-4 text-amber-400" />
              <span>Google Search Console OAuth Setup Guide</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              To connect real Search Console properties, configure these confidential environment variables on the backend:
            </p>
            <div className="bg-slate-950 p-2.5 rounded font-mono text-[11px] text-slate-300 space-y-1">
              <div>GOOGLE_CLIENT_ID=&quot;your_google_cloud_client_id.apps.googleusercontent.com&quot;</div>
              <div>GOOGLE_CLIENT_SECRET=&quot;your_google_cloud_client_secret&quot;</div>
              <div className="text-slate-500"># Authorized Redirect URI in Google Cloud Console:</div>
              <div className="text-emerald-400">&lt;APP_URL&gt;/api/search-console/callback</div>
            </div>
            <p className="text-slate-400 text-[11px]">
              Note: When unconfigured, ZyvenSEO operates in <strong>Mode B</strong> (synthesizing evidence from the audited website HTML without fabricating rankings).
            </p>
          </div>
        )}

        {/* Property Selector & Matching Bar */}
        {isConnected && (
          <div className="pt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-slate-300">Selected Property:</span>
              {gscState.properties.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Select Search Console Property"
                    value={gscState.selectedProperty || gscState.properties[0]?.siteUrl}
                    onChange={(e) => onSelectProperty(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:border-emerald-500"
                  >
                    {gscState.properties.map((p) => (
                      <option key={p.siteUrl} value={p.siteUrl}>
                        {p.displayName} ({p.type})
                      </option>
                    ))}
                  </select>

                  {/* Property type badge */}
                  {(() => {
                    const activeProp = gscState.properties.find(
                      (p) => p.siteUrl === (gscState.selectedProperty || gscState.properties[0]?.siteUrl)
                    );
                    return activeProp ? (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {activeProp.type}
                      </span>
                    ) : null;
                  })()}
                </div>
              ) : (
                <span className="text-xs text-slate-400 font-mono">No properties found on this Google account</span>
              )}
            </div>

            {/* Matching Property Recommendation */}
            {recommendedProperty && recommendedProperty.siteUrl !== gscState.selectedProperty && (
              <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-800/40 rounded-md px-3 py-1.5 text-xs text-emerald-300">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Matches audited URL: <strong>{recommendedProperty.displayName}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => onSelectProperty(recommendedProperty.siteUrl)}
                  className="underline hover:text-emerald-200 cursor-pointer text-xs ml-1 font-medium"
                >
                  Select this property
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-[#111827] border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-semibold text-slate-100">Disconnect Search Console?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will remove the current authorized session and clear cached Search Console data from ZyvenSEO AI. No settings or data in your Google account will be deleted.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                className="px-3 py-1.5 text-xs text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDisconnectModal(false);
                  onDisconnectGsc();
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-md transition-colors"
              >
                Confirm Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date Range Selector & Period Display */}
      {isConnected && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-300">Reporting Period:</span>
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyDateRange(p.id)}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  selectedPreset === p.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {selectedPreset === 'custom' && (
            <form onSubmit={handleCustomDateSubmit} className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                aria-label="Start date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                required
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                aria-label="End date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs"
                required
              />
              <button
                type="submit"
                className="px-2.5 py-1 bg-emerald-500 text-slate-950 font-medium rounded text-xs hover:bg-emerald-400 transition-colors"
              >
                Apply Range
              </button>
            </form>
          )}

          {data && (
            <div className="text-right text-slate-400 font-mono text-[11px] shrink-0">
              Data period:{' '}
              <span className="text-emerald-400 font-semibold">
                {data.dateRange.startDate} → {data.dateRange.endDate}
              </span>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Fetched {new Date(data.lastFetched).toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. Top Summary Metric Cards */}
      {isConnected && data ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Clicks</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {data.totals.clicks.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Direct search visits from Google</div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Search Impressions
            </div>
            <div className="text-2xl font-bold font-mono text-sky-400 mt-1">
              {data.totals.impressions.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">SERP appearances (not global volume)</div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Average CTR</div>
            <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{data.totals.avgCtr}%</div>
            <div className="text-[11px] text-slate-500 mt-1">Clicks per 100 search impressions</div>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Average Position
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-400 mt-1">
              {data.totals.avgPosition > 0 ? data.totals.avgPosition : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Weighted rank across all queries</div>
          </div>
        </div>
      ) : isConnected && !data ? (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-8 text-center text-xs space-y-2">
          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
          <p className="text-slate-300 font-medium">Retrieving real Search Console data from Google...</p>
          <p className="text-slate-500">Querying verified sites and search analytics dimensions.</p>
        </div>
      ) : null}

      {/* 3. Detailed Reporting Tabs Navigation */}
      {isConnected && data && (
        <div className="border-b border-slate-800 flex overflow-x-auto gap-2 text-xs scrollbar-none pb-px">
          {[
            { id: 'queries', label: `Search Queries (${data.rows.length})` },
            { id: 'pages', label: `Top Pages (${data.pages.length})` },
            { id: 'quick-wins', label: `Quick Wins (${data.quickWins.length})` },
            { id: 'ctr-opps', label: `CTR Opportunities (${data.lowCtrOpportunities.length})` },
            { id: 'brackets', label: 'Position Brackets' },
            { id: 'overlap', label: `Query Overlap (${data.cannibalizationSignals.length})` },
            { id: 'geography', label: `Countries & Devices (${data.countries.length})` },
            { id: 'trends', label: `Daily Trends (${data.dateTrends.length}d)` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as GSCTab)}
              className={`px-3.5 py-2.5 font-medium whitespace-nowrap transition-colors border-b-2 cursor-pointer ${
                activeTab === t.id
                  ? 'border-emerald-400 text-emerald-400 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* TAB 1: Search Queries */}
      {isConnected && data && activeTab === 'queries' && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search queries or URLs..."
                value={querySearch}
                onChange={(e) => {
                  setQuerySearch(e.target.value);
                  setQueryPage(1);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <a
                href={getGscExportUrl('queries')}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-300 hover:text-slate-100 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                Export CSV
              </a>
            </div>
          </div>

          {filteredQueries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
              No Search Console queries matched your filter or period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 pr-3 font-semibold">Query</th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortByQuery === 'clicks') setSortOrderQuery((o) => (o === 'asc' ? 'desc' : 'asc'));
                          else {
                            setSortByQuery('clicks');
                            setSortOrderQuery('desc');
                          }
                        }}
                        className="inline-flex items-center gap-1 hover:text-slate-200"
                      >
                        Clicks <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortByQuery === 'impressions') setSortOrderQuery((o) => (o === 'asc' ? 'desc' : 'asc'));
                          else {
                            setSortByQuery('impressions');
                            setSortOrderQuery('desc');
                          }
                        }}
                        className="inline-flex items-center gap-1 hover:text-slate-200"
                      >
                        Impressions <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortByQuery === 'ctr') setSortOrderQuery((o) => (o === 'asc' ? 'desc' : 'asc'));
                          else {
                            setSortByQuery('ctr');
                            setSortOrderQuery('desc');
                          }
                        }}
                        className="inline-flex items-center gap-1 hover:text-slate-200"
                      >
                        CTR <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          if (sortByQuery === 'position') setSortOrderQuery((o) => (o === 'asc' ? 'desc' : 'asc'));
                          else {
                            setSortByQuery('position');
                            setSortOrderQuery('asc');
                          }
                        }}
                        className="inline-flex items-center gap-1 hover:text-slate-200"
                      >
                        Avg Pos <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-2.5 pl-3 font-semibold">Landing Page</th>
                    <th className="py-2.5 pl-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {paginatedQueries.map((r, i) => {
                    const taskId = `q-${i}-${encodeURIComponent(r.query).slice(0, 20)}`;
                    const isAdded = addedTasks[taskId];

                    return (
                      <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-2.5 pr-3 font-sans text-slate-100 font-medium">
                          &ldquo;{r.query}&rdquo;
                        </td>
                        <td className="py-2.5 px-3 text-emerald-400 font-semibold">{r.clicks.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-sky-400">{r.impressions.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-amber-400">{r.ctr}%</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              r.position <= 3
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : r.position <= 10
                                ? 'bg-sky-950 text-sky-300 border border-sky-800'
                                : r.position <= 20
                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            Pos {r.position}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-slate-400 max-w-xs truncate" title={r.page}>
                          {r.page}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              handleAddToActions({
                                id: taskId,
                                title: `Optimize rankings for "${r.query}" (Pos ${r.position})`,
                                category: 'Search Console Quick Win',
                                priority: r.position <= 10 ? 'P1 High' : 'P2 Medium',
                                evidence: `Search Console shows ${r.impressions} impressions and CTR ${r.ctr}% on ${r.page}.`,
                                recommendedAction: `Incorporate "${r.query}" into title tag, H2 subheading, and build internal links with matching anchor.`,
                              })
                            }
                            disabled={isAdded}
                            className={`inline-flex items-center gap-1 text-[10px] font-sans px-2 py-1 rounded transition-colors ${
                              isAdded
                                ? 'bg-emerald-950 text-emerald-300'
                                : 'text-slate-300 bg-slate-800 hover:bg-slate-700'
                            }`}
                          >
                            {isAdded ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" /> Added
                              </>
                            ) : (
                              <>
                                <PlusCircle className="w-3 h-3" /> Add Action
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalQueryPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
              <div>
                Showing {(queryPage - 1) * itemsPerPage + 1}–
                {Math.min(queryPage * itemsPerPage, filteredQueries.length)} of {filteredQueries.length} queries
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={queryPage <= 1}
                  onClick={() => setQueryPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Previous
                </button>
                <span>
                  Page {queryPage} of {totalQueryPages}
                </span>
                <button
                  type="button"
                  disabled={queryPage >= totalQueryPages}
                  onClick={() => setQueryPage((p) => Math.min(totalQueryPages, p + 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Top Pages */}
      {isConnected && data && activeTab === 'pages' && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Filter pages by URL..."
                value={pageSearch}
                onChange={(e) => {
                  setPageSearch(e.target.value);
                  setPagePage(1);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-md pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <a
              href={getGscExportUrl('pages')}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md text-slate-300 hover:text-slate-100 transition-colors text-xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              Export Pages CSV
            </a>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 pr-3 font-semibold">Page URL</th>
                  <th className="py-2.5 px-3 font-semibold">Clicks</th>
                  <th className="py-2.5 px-3 font-semibold">Impressions</th>
                  <th className="py-2.5 px-3 font-semibold">CTR</th>
                  <th className="py-2.5 px-3 font-semibold">Avg Pos</th>
                  <th className="py-2.5 px-3 font-semibold">Top Query</th>
                  <th className="py-2.5 pl-3 font-semibold text-right">Audit Integration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {paginatedPages.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-2.5 pr-3 font-mono text-slate-200 max-w-md truncate" title={p.page}>
                      {p.page}
                    </td>
                    <td className="py-2.5 px-3 text-emerald-400 font-semibold">{p.clicks.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-sky-400">{p.impressions.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-amber-400">{p.ctr}%</td>
                    <td className="py-2.5 px-3 text-slate-300">{p.position}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-400 truncate max-w-xs">
                      {p.topQueries[0] ? `"${p.topQueries[0].query}"` : '—'}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {onAuditPage ? (
                        <button
                          type="button"
                          onClick={() => onAuditPage(p.page)}
                          className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 rounded transition-colors cursor-pointer"
                        >
                          Audit This Page
                        </button>
                      ) : (
                        <a
                          href={p.page}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-slate-200"
                        >
                          <ExternalLink className="w-3.5 h-3.5 inline" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPagePages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
              <div>
                Showing {(pagePage - 1) * itemsPerPage + 1}–
                {Math.min(pagePage * itemsPerPage, filteredPages.length)} of {filteredPages.length} pages
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagePage <= 1}
                  onClick={() => setPagePage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Previous
                </button>
                <span>
                  Page {pagePage} of {totalPagePages}
                </span>
                <button
                  type="button"
                  disabled={pagePage >= totalPagePages}
                  onClick={() => setPagePage((p) => Math.min(totalPagePages, p + 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Quick Wins Engine */}
      {isConnected && data && activeTab === 'quick-wins' && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Deterministic Quick Win Engine (Positions 4–10 &amp; Striking Distance 11–20)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Google already ranks these pages near the top. Small targeted on-page optimizations can yield significant traffic gains.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.quickWins.slice(0, 10).map((r, i) => {
              const taskId = `qw-${i}-${encodeURIComponent(r.query).slice(0, 20)}`;
              const isAdded = addedTasks[taskId];

              return (
                <div key={i} className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-emerald-400 font-sans">
                        &ldquo;{r.query}&rdquo;
                      </span>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5 truncate max-w-xs">
                        {r.page}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                      Pos {r.position}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-center bg-slate-950/60 p-2 rounded">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Clicks</span>
                      <span className="text-emerald-400 font-semibold">{r.clicks}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Impressions</span>
                      <span className="text-sky-400">{r.impressions}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">CTR</span>
                      <span className="text-amber-400">{r.ctr}%</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    <strong>Recommended Action:</strong> Feature &ldquo;{r.query}&rdquo; directly in the &lt;title&gt; and first H2, add rich schema markup, and cross-link from high-traffic internal pages.
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    {onAuditPage && (
                      <button
                        type="button"
                        onClick={() => onAuditPage(r.page)}
                        className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                      >
                        Audit URL →
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handleAddToActions({
                          id: taskId,
                          title: `Optimize Page 1 visibility for "${r.query}" (Pos ${r.position})`,
                          category: 'Quick Win',
                          priority: 'P1 High',
                          evidence: `Search Console confirms position ${r.position} with ${r.impressions} impressions and CTR ${r.ctr}%.`,
                          recommendedAction: `Update page title and H2 to align with query "${r.query}", add internal links with keyword anchor.`,
                        })
                      }
                      disabled={isAdded}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors ${
                        isAdded ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isAdded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <PlusCircle className="w-3.5 h-3.5" />}
                      {isAdded ? 'Added to Actions' : 'Add to Action Center'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: CTR Opportunities */}
      {isConnected && data && activeTab === 'ctr-opps' && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              High Impression / Low CTR Outliers (Snippet Optimization Candidates)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              These queries show high organic visibility in search results, but below-average click-through rates. Improving the snippet headline, value proposition, and search-intent alignment can unlock visits without higher rank.
            </p>
          </div>

          <div className="space-y-3">
            {data.lowCtrOpportunities.map((r, i) => {
              const taskId = `ctr-${i}-${encodeURIComponent(r.query).slice(0, 20)}`;
              const isAdded = addedTasks[taskId];

              return (
                <div key={i} className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-amber-300 font-sans">
                        &ldquo;{r.query}&rdquo;
                      </span>
                      <span className="text-slate-500 font-mono text-[11px] ml-2 truncate max-w-sm">
                        ↳ {r.page}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-xs shrink-0">
                      <span className="text-sky-400">{r.impressions} impr</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-rose-400 font-semibold">{r.ctr}% CTR</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400">Pos {r.position}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    <strong>Opportunity Diagnosis:</strong> Potential search intent mismatch or weak snippet hook. Replace passive description with a direct answer or concrete outcome statement aligned to &ldquo;{r.query}&rdquo;.
                  </p>

                  <div className="flex items-center justify-end gap-3 pt-1">
                    {onAuditPage && (
                      <button
                        type="button"
                        onClick={() => onAuditPage(r.page)}
                        className="text-xs text-emerald-400 hover:underline cursor-pointer"
                      >
                        Audit Page Snippet
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        handleAddToActions({
                          id: taskId,
                          title: `Improve snippet CTR for "${r.query}" (Current CTR: ${r.ctr}%)`,
                          category: 'Snippet CTR Optimization',
                          priority: 'P1 High',
                          evidence: `Search Console shows ${r.impressions} impressions at position ${r.position}, but CTR is only ${r.ctr}%.`,
                          recommendedAction: `Rewrite meta description to highlight a compelling outcome; ensure title tag matches exact intent for "${r.query}".`,
                        })
                      }
                      disabled={isAdded}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors ${
                        isAdded ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      {isAdded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <PlusCircle className="w-3.5 h-3.5" />}
                      {isAdded ? 'Added' : 'Add to Action Center'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: Position Brackets Breakdown */}
      {isConnected && data && activeTab === 'brackets' && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Position Distribution &amp; Ranking Brackets</h3>
            <p className="text-xs text-slate-400 mt-1">
              Distribution of verified queries across standard search visibility tiers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                tier: 'Positions 1–3',
                label: 'Top 3 (High CTR Zone)',
                count: data.position1To3.length,
                color: 'text-emerald-400',
                border: 'border-emerald-500/30',
              },
              {
                tier: 'Positions 4–10',
                label: 'Page 1 Striking Distance',
                count: data.position4To10.length,
                color: 'text-sky-400',
                border: 'border-sky-500/30',
              },
              {
                tier: 'Positions 11–20',
                label: 'Page 2 (Striking Distance)',
                count: data.position11To20.length,
                color: 'text-amber-400',
                border: 'border-amber-500/30',
              },
              {
                tier: 'Positions 21–30',
                label: 'Page 3',
                count: data.position21To30.length,
                color: 'text-indigo-400',
                border: 'border-indigo-500/30',
              },
              {
                tier: 'Positions 31+',
                label: 'Deep Discovery',
                count: data.position31Plus.length,
                color: 'text-slate-400',
                border: 'border-slate-700',
              },
            ].map((b, i) => (
              <div key={i} className={`p-4 bg-slate-900 border ${b.border} rounded-lg text-center space-y-1`}>
                <div className="text-xs text-slate-400 font-medium">{b.tier}</div>
                <div className={`text-2xl font-bold font-mono ${b.color}`}>{b.count}</div>
                <div className="text-[10px] text-slate-500">{b.label}</div>
              </div>
            ))}
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-200">
              Page 2 Striking Distance Candidates (Positions 11–20)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {data.position11To20.slice(0, 8).map((r, i) => (
                <div key={i} className="p-3 bg-slate-900/60 border border-slate-800 rounded font-mono text-[11px] space-y-1">
                  <div className="flex justify-between items-center text-slate-200 font-sans font-medium">
                    <span>&ldquo;{r.query}&rdquo;</span>
                    <span className="text-amber-400">Pos {r.position}</span>
                  </div>
                  <div className="text-slate-400 text-[10px] truncate">{r.page}</div>
                  <div className="flex gap-3 text-slate-500 text-[10px]">
                    <span>{r.impressions} impr</span>
                    <span>{r.clicks} clicks</span>
                    <span>{r.ctr}% CTR</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Query Overlap / Cannibalization Signals */}
      {isConnected && data && activeTab === 'overlap' && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Query → Page Mapping &amp; Potential Overlap Detection
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Identifies instances where multiple distinct URLs on your domain compete for the same query. (Labeled as &ldquo;Potential query/page overlap detected&rdquo; — requires human editorial review before canonical consolidation).
            </p>
          </div>

          {data.cannibalizationSignals.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
              No significant multi-page query overlaps detected in this reporting period.
            </div>
          ) : (
            <div className="space-y-3">
              {data.cannibalizationSignals.map((c, i) => (
                <div key={i} className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-amber-300">
                      Potential Overlap: &ldquo;{c.query}&rdquo;
                    </span>
                    <span className="text-xs font-mono text-slate-400">{c.impressions} shared impressions</span>
                  </div>
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] text-slate-400 font-medium">Competing URLs in Search Console:</div>
                    <ul className="list-disc list-inside font-mono text-[11px] text-slate-300 space-y-0.5">
                      {c.pages.map((url, uidx) => (
                        <li key={uidx} className="truncate" title={url}>
                          {url}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                    <strong>Resolution Guidance:</strong> Evaluate whether these pages target different user intents or if one primary canonical page should be designated. Cross-link between pages with distinct descriptive anchor text.
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 7: Countries & Devices */}
      {isConnected && data && activeTab === 'geography' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Countries */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
              <Globe className="w-4 h-4 text-sky-400" />
              <span>Geographic Distribution (Countries)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                    <th className="py-2 pr-2">Country</th>
                    <th className="py-2 px-2 text-right">Clicks</th>
                    <th className="py-2 px-2 text-right">Impr</th>
                    <th className="py-2 px-2 text-right">CTR</th>
                    <th className="py-2 pl-2 text-right">Avg Pos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {data.countries.slice(0, 10).map((c, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-2 font-sans text-slate-200">{c.countryName}</td>
                      <td className="py-2 px-2 text-right text-emerald-400">{c.clicks.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-slate-300">{c.impressions.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-amber-400">{c.ctr}%</td>
                      <td className="py-2 pl-2 text-right text-slate-400">{c.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Devices */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-2 text-slate-200 text-sm font-semibold">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Device Breakdown</span>
            </div>
            <div className="space-y-4 pt-2">
              {data.devices.map((d, i) => {
                const totalClicks = data.totals.clicks || 1;
                const percent = Math.round((d.clicks / totalClicks) * 100);

                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-300">{d.device}</span>
                      <span className="font-mono text-slate-400">
                        {d.clicks.toLocaleString()} clicks ({percent}%) · Pos {d.position}
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full rounded-full transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: Daily Search Trends */}
      {isConnected && data && activeTab === 'trends' && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Daily Search Console Performance Trend</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Observed clicks, impressions, CTR, and average position day-by-day.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse font-mono text-[11px]">
              <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                <tr>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 px-3">Clicks</th>
                  <th className="py-2 px-3">Impressions</th>
                  <th className="py-2 px-3">CTR (%)</th>
                  <th className="py-2 pl-3">Avg Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.dateTrends.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-900/40">
                    <td className="py-2 pr-3 text-slate-300 font-sans">{t.date}</td>
                    <td className="py-2 px-3 text-emerald-400 font-semibold">{t.clicks}</td>
                    <td className="py-2 px-3 text-sky-400">{t.impressions}</td>
                    <td className="py-2 px-3 text-amber-400">{t.ctr}%</td>
                    <td className="py-2 pl-3 text-slate-300">{t.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* When NOT Connected */}
      {!isConnected && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
            <Unlink className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-semibold text-slate-100">Google Search Console is not connected</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connect your verified Google Search Console account via OAuth 2.0 to view verified Google Search queries, impressions, CTR, average positions, and automated quick wins.
            </p>
          </div>
          <button
            type="button"
            onClick={onConnectGsc}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Connect Google Search Console
          </button>
        </div>
      )}
    </div>
  );
};
