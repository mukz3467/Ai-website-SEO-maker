import React, { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import type {
  AIGrowthStrategy,
  GSCConnectionState,
  SEOIssue,
  TaskStatus,
  WebsiteAuditResult,
} from '../types/seo';
import { CopyPromptButton, severityTextStyle } from './AuditSections';

export const SearchIntelligenceSection: React.FC<{
  audit: WebsiteAuditResult;
  gscState: GSCConnectionState;
  onConnectGsc: () => void;
  onSelectGscProperty: (prop: string) => void;
  isLoadingGsc: boolean;
}> = ({ audit, gscState, onConnectGsc, onSelectGscProperty, isLoadingGsc }) => {
  const isConnectedWithData = gscState.status === 'Connected' && Boolean(gscState.data);
  const gscData = gscState.data;

  return (
    <div className="space-y-6">
      {/* Google Search Console Connection & Mode Bar */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-200">Google Search Console Connection:</span>
              <span
                className={
                  gscState.status === 'Connected'
                    ? 'text-emerald-400 font-semibold'
                    : gscState.status === 'Permission Required'
                    ? 'text-amber-400 font-semibold'
                    : 'text-slate-400 font-medium'
                }
              >
                {gscState.status}
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-300">
                Active Mode:{' '}
                <strong className="text-emerald-400">
                  {isConnectedWithData
                    ? 'Mode A — Verified Google Search Console Data'
                    : 'Mode B — AI-Derived Opportunities (Observed Website HTML)'}
                </strong>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{gscState.message}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {gscState.properties.length > 0 && (
              <select
                aria-label="Select Search Console Property"
                value={gscState.selectedProperty || gscState.properties[0]?.siteUrl}
                onChange={(e) => onSelectGscProperty(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {gscState.properties.map((p) => (
                  <option key={p.siteUrl} value={p.siteUrl}>
                    {p.displayName} ({p.type})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={onConnectGsc}
              disabled={isLoadingGsc}
              className="px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {isLoadingGsc
                ? 'Checking OAuth...'
                : gscState.status === 'Connected'
                ? 'Refresh Search Console Data'
                : 'Connect Google Search Console'}
            </button>
          </div>
        </div>

        {/* Mode Explanation */}
        <div className="pt-4 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Security Notice: ZyvenSEO uses OAuth 2.0 read-only scope (<code className="text-slate-300">webmasters.readonly</code>). Never enter Google passwords into any third-party form.
          </span>
          <span className="font-mono text-slate-500">Zero fabricated rankings policy enforced</span>
        </div>
      </div>

      {/* MODE A: Actual Search Console Data */}
      {isConnectedWithData && gscData ? (
        <div className="space-y-6">
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800/80">
              <h3 className="text-base font-semibold text-slate-100">
                Mode A: Verified Search Console Opportunities ({gscData.propertyUrl})
              </h3>
              <span className="text-xs font-mono text-slate-400">
                Window: {gscData.dateRange.startDate} → {gscData.dateRange.endDate} · {gscData.rows.length} rows
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs">
              <div>
                <div className="font-semibold text-emerald-400 mb-2">
                  Quick Wins (Pos 4–12 · {gscData.quickWins.length})
                </div>
                {gscData.quickWins.length === 0 ? (
                  <p className="text-slate-500">No queries in position 4–12 threshold.</p>
                ) : (
                  <ul className="space-y-2">
                    {gscData.quickWins.slice(0, 6).map((r, i) => (
                      <li key={i} className="font-mono text-[11px] text-slate-300">
                        &ldquo;{r.query}&rdquo; · Pos {r.position} · {r.impressions} impr · CTR {r.ctr}%
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="font-semibold text-amber-400 mb-2">
                  High Impression / Low CTR ({gscData.lowCtrOpportunities.length})
                </div>
                {gscData.lowCtrOpportunities.length === 0 ? (
                  <p className="text-slate-500">No high-impression / low-CTR outliers detected.</p>
                ) : (
                  <ul className="space-y-2">
                    {gscData.lowCtrOpportunities.slice(0, 6).map((r, i) => (
                      <li key={i} className="font-mono text-[11px] text-slate-300">
                        &ldquo;{r.query}&rdquo; · {r.impressions} impr · CTR {r.ctr}% (Pos {r.position})
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="font-semibold text-sky-400 mb-2">
                  Position Brackets (5–10 / 11–20 / 21–30)
                </div>
                <div className="space-y-2 font-mono text-[11px] text-slate-300">
                  <div>
                    <span className="text-slate-400">Positions 4–10:</span> {(gscData.position4To10 || []).length} queries
                    {(gscData.position4To10 || []).length > 0 && (
                      <div className="text-[10px] text-emerald-400/90 truncate mt-0.5">
                        ↳ {(gscData.position4To10 || []).slice(0, 3).map((r: { query: string }) => `"${r.query}"`).join(', ')}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400">Positions 11–20 (Page 2):</span> {gscData.position11To20.length} queries
                    {gscData.position11To20.length > 0 && (
                      <div className="text-[10px] text-sky-400/90 truncate mt-0.5">
                        ↳ {gscData.position11To20.slice(0, 3).map((r) => `"${r.query}"`).join(', ')}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400">Positions 21–30:</span> {gscData.position21To30.length} queries
                  </div>
                  <div>
                    <span className="text-slate-400">Cannibalization Signals:</span> {gscData.cannibalizationSignals.length} queries
                    {gscData.cannibalizationSignals.length > 0 && (
                      <div className="text-[10px] text-amber-400 truncate mt-0.5">
                        ↳ &ldquo;{gscData.cannibalizationSignals[0].query}&rdquo; ({gscData.cannibalizationSignals[0].pages.length} URLs)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* MODE B: Google Search Console Not Connected — AI-Derived Opportunities */
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
          <div className="pb-4 border-b border-slate-800/80">
            <div className="text-xs text-amber-400 font-medium mb-1">
              Mode B Active · AI-Derived Opportunities from Observed Website Content
            </div>
            <h2 className="text-base font-semibold text-slate-100">
              Observable Search Opportunity & Snippet CTR Optimization
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Because Google Search Console is not connected, no Google ranking positions, impressions, or clicks are shown. Below are strictly AI-derived search opportunities grounded in the live HTML inspected on {audit.finalUrl}.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-100">
                01. AI-Derived Quick Win Opportunities (Observed On-Page Signals)
              </h3>
              <ul className="space-y-2.5 text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-emerald-400">Title & H1 Alignment:</strong>{' '}
                  {audit.metadata.title
                    ? `Current title "${audit.metadata.title}" (${audit.metadata.titleLength} chars) can be sharpened around primary topic "${audit.contentIntelligence.primaryTopic}" for higher SERP click-through.`
                    : `Adding a missing <title> tag targeting "${audit.contentIntelligence.primaryTopic}" is the single highest-impact quick win.`}
                </li>
                <li>
                  <strong className="text-emerald-400">Snippet CTR Improvement:</strong>{' '}
                  {audit.metadata.metaDescription
                    ? `Current meta description (${audit.metadata.metaDescriptionLength} chars) should highlight a concrete outcome aligned with "${audit.primaryGoal}".`
                    : `Adding a 140-character <meta name="description"> prevents search engines from pulling random navigational text into the snippet.`}
                </li>
                <li>
                  <strong className="text-emerald-400">Long-Tail Subheading Capture:</strong>{' '}
                  Observed {audit.headings.h2.length} H2 subheadings. Structuring H2s around explicit user questions in {audit.targetMarket} expands long-tail query eligibility.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-slate-100">
                02. AI-Derived Query & Intent Themes (No Fabricated Rankings)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">AI-Derived Target Theme</th>
                      <th className="py-2 px-3">Intent</th>
                      <th className="py-2 pl-3">GSC Position / Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    <tr>
                      <td className="py-2.5 pr-3 text-slate-100 font-medium">
                        {audit.contentIntelligence.primaryTopic}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {audit.contentIntelligence.probableSearchIntent}
                      </td>
                      <td className="py-2.5 pl-3 font-mono text-[11px] text-slate-500">
                        Not measured (GSC not connected)
                      </td>
                    </tr>
                    {audit.contentIntelligence.secondaryTopics.slice(0, 4).map((topic, i) => (
                      <tr key={i}>
                        <td className="py-2.5 pr-3 text-slate-200">{topic}</td>
                        <td className="py-2.5 px-3 text-slate-300">Supporting</td>
                        <td className="py-2.5 pl-3 font-mono text-[11px] text-slate-500">
                          Not measured (GSC not connected)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const AiGrowthEngineSection: React.FC<{
  audit: WebsiteAuditResult;
  strategy: AIGrowthStrategy | null;
  isGenerating: boolean;
  onGenerate: () => void;
}> = ({ audit, strategy, isGenerating, onGenerate }) => {
  const [copiedReport, setCopiedReport] = useState(false);

  const handleCopyReport = () => {
    if (!strategy) return;
    navigator.clipboard.writeText(strategy.searchIntelligenceReport);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Control Bar */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <span>AI SEO Growth Engine</span>
            {strategy && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-400">
                  Source: {strategy.generatedBy === 'GEMINI_AI' ? 'Server-Side AI Synthesis' : 'Deterministic SEO Engine'}
                </span>
              </>
            )}
          </div>
          <h2 className="text-base font-semibold text-slate-100 mt-0.5">
            Comprehensive Website SEO Growth Strategy & Search Intelligence Report
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Synthesizes observed technical, on-page, content, and linking findings into a prioritized execution roadmap without inventing metrics.
          </p>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Synthesizing Growth Plan...' : strategy ? 'Regenerate AI Growth Plan' : 'Generate AI SEO Growth Plan'}</span>
        </button>
      </div>

      {!strategy && !isGenerating && (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-8 text-center space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Ready to Synthesize Full AI SEO Growth Plan for {audit.finalUrl}
          </h3>
          <p className="text-xs text-slate-400 max-w-xl mx-auto">
            Click &ldquo;Generate AI SEO Growth Plan&rdquo; above to produce your Executive Summary, one-click copyable Search Intelligence Report, Priority Fixes, Topic Cluster Strategy, White-Hat Digital PR Plan, and Safe Auto-Fix classification.
          </p>
        </div>
      )}

      {isGenerating && (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-8 space-y-4">
          <div className="text-xs font-mono text-emerald-400">
            Synthesizing observed website signals and building Search Intelligence Report...
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-slate-800/80 rounded w-3/4 animate-pulse" />
            <div className="h-4 bg-slate-800/80 rounded w-1/2 animate-pulse" />
            <div className="h-24 bg-slate-800/60 rounded w-full animate-pulse mt-4" />
          </div>
        </div>
      )}

      {strategy && !isGenerating && (
        <div className="space-y-6">
          {/* Executive Summary */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-2">
            <h3 className="text-sm font-semibold text-slate-100">Executive Summary</h3>
            <p className="text-xs text-slate-200 leading-relaxed">{strategy.executiveSummary}</p>
          </div>

          {/* Complete Copyable Search Intelligence Report */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Complete Search Intelligence Report (Copyable Document)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Covers current search opportunity, observed topic relevance, GSC/AI opportunities, content gaps, and next actions.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyReport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                <span>{copiedReport ? 'Copied Full Report' : 'Copy Search Intelligence Report'}</span>
              </button>
            </div>
            <pre className="bg-slate-950 border border-slate-800/90 rounded-lg p-4 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[460px] overflow-y-auto">
              {strategy.searchIntelligenceReport}
            </pre>
          </div>

          {/* Priority Fixes (Prompt 3 Section 9) */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Prioritized High-Impact SEO Action Plan ({strategy.priorityFixes.length} Actions)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ordered by verified severity and crawler impact. High priority is only assigned when supported by direct audit evidence.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">P0 Critical → P3 Low</span>
            </div>

            <div className="divide-y divide-slate-800/80 text-xs">
              {strategy.priorityFixes.map((fix, idx) => (
                <div key={idx} className="py-4 first:pt-3 last:pb-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={severityTextStyle(fix.priority as any)}>{fix.priority}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px] font-mono">
                        {fix.category}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-100">{fix.title}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        Impact: <strong className="text-emerald-400">{fix.expectedImpact}</strong> · Diff: {fix.difficulty}
                      </span>
                      <CopyPromptButton
                        text={`Execute fix: ${fix.title}\nCategory: ${fix.category}\nEvidence: ${fix.evidence}\nWhy It Matters: ${fix.whyItMatters}\nRecommended Action: ${fix.recommendedAction}`}
                        label="Copy Fix Prompt"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 text-slate-300">
                    <div>
                      <span className="text-slate-500 block mb-0.5 font-medium">Observed Evidence</span>
                      <p className="font-mono text-[11px] text-slate-200">{fix.evidence}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5 font-medium">Why It Matters</span>
                      <p className="text-slate-300">{fix.whyItMatters}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 block mb-0.5 font-medium">Recommended Action</span>
                      <p className="text-emerald-300/90 font-medium">{fix.recommendedAction}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 text-[11px] font-mono">
                    <span
                      className={`px-2 py-0.5 rounded ${
                        fix.autoFixable
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                          : 'bg-slate-900 text-slate-400 border border-slate-800'
                      }`}
                    >
                      {fix.autoFixable ? 'Safe Auto-Fix Eligible' : 'Manual Implementation'}
                    </span>
                    {fix.requiresReview && (
                      <span className="px-2 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-800/60 rounded">
                        Requires Architecture/Editorial Review
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Keyword & Topic Intelligence (Prompt 3 Section 13) */}
          {strategy.contentStrategy.keywordTopicCandidates && strategy.contentStrategy.keywordTopicCandidates.length > 0 && (
            <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Keyword & Topic Intelligence (Target Market: {audit.targetMarket})
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Grounded in observed site content and topical relevance. Zero synthetic search volumes.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500">Unmeasured volumes policy enforced</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 pr-4">Topic Candidate</th>
                      <th className="py-2.5 px-3">Search Intent</th>
                      <th className="py-2.5 px-3">Strategic Rationale</th>
                      <th className="py-2.5 px-3">Recommended Page Type</th>
                      <th className="py-2.5 pl-3">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {strategy.contentStrategy.keywordTopicCandidates.map((cand, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/40">
                        <td className="py-2.5 pr-4 text-slate-100 font-semibold">{cand.topic}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-sans">{cand.searchIntent}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans max-w-xs">{cand.reason}</td>
                        <td className="py-2.5 px-3 text-slate-400 font-sans">{cand.recommendedPageType}</td>
                        <td className="py-2.5 pl-3 font-sans">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              cand.priority === 'High'
                                ? 'bg-emerald-950/80 text-emerald-400'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {cand.priority}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Topic Cluster & Content Blueprint (Prompt 3 Section 12) */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100 pb-3 border-b border-slate-800/80">
              Topic Cluster Architecture & Content Gap Opportunities
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-3">
                <h4 className="font-semibold text-emerald-400">Identified Content Gap Opportunities</h4>
                <ul className="space-y-2 text-slate-300">
                  {strategy.contentStrategy.contentGaps.map((gap, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-400 font-mono">•</span>
                      <span>{gap}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sky-400">Topic Cluster & Pillar Blueprint</h4>
                <div className="space-y-3">
                  {strategy.contentStrategy.topicClusters.map((tc, idx) => (
                    <div key={idx} className="p-3 bg-slate-900/80 border border-slate-800 rounded space-y-1.5">
                      <div className="font-semibold text-slate-100 flex items-center justify-between">
                        <span>Cluster: {tc.cluster}</span>
                        <span className="text-[10px] text-emerald-400 font-mono">{tc.searchIntent} Intent</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">Pillar Target: {tc.pillarPage}</p>
                      <div className="text-[11px] text-slate-300 space-y-0.5 pt-1">
                        {tc.supportingContent.map((sub, i) => (
                          <div key={i}>↳ {sub}</div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Technical, On-Page, Internal Linking, Structured Data */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-100 pb-4 border-b border-slate-800/80">
              Domain-Specific Execution Roadmaps
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 text-xs">
              <div>
                <h4 className="font-semibold text-slate-200 mb-2">Technical SEO Fixes</h4>
                <ul className="space-y-1.5 text-slate-300">
                  {strategy.technicalSeoFixes.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-slate-200 mb-2">On-Page SEO Fixes</h4>
                <ul className="space-y-1.5 text-slate-300">
                  {strategy.onPageFixes.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-slate-200 mb-2">Internal Linking Strategy (Discovered URLs Only)</h4>
                <ul className="space-y-1.5 text-slate-300">
                  {strategy.internalLinkingStrategy.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-slate-200 mb-2">Structured Data & Schema Strategy</h4>
                <ul className="space-y-1.5 text-slate-300">
                  {strategy.structuredDataStrategy.map((item, i) => (
                    <li key={i}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Backlink Opportunities & Authority Building (Prompt 3 Section 18) */}
          {strategy.backlinkOpportunities && strategy.backlinkOpportunities.length > 0 && (
            <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Legitimate Authority Building & Backlink Opportunities (White-Hat Only)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Strategic opportunity types based on real content utility. Never recommends paid spam, PBNs, or link farms.
                  </p>
                </div>
                <span className="text-xs font-mono text-emerald-400">Editorial Mentions Focus</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2.5 pr-4">Opportunity Type</th>
                      <th className="py-2.5 px-3">Strategic Relevance</th>
                      <th className="py-2.5 px-3">Recommended Approach</th>
                      <th className="py-2.5 px-3">Content Asset Required</th>
                      <th className="py-2.5 pl-3">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {strategy.backlinkOpportunities.map((bo, i) => (
                      <tr key={i} className="hover:bg-slate-900/40">
                        <td className="py-2.5 pr-4 text-slate-100 font-semibold">{bo.opportunityType}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans max-w-xs">{bo.whyRelevant}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans max-w-xs">{bo.recommendedApproach}</td>
                        <td className="py-2.5 px-3 text-emerald-400 font-sans">{bo.contentAssetNeeded}</td>
                        <td className="py-2.5 pl-3 font-sans">
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px]">
                            {bo.priority}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Digital PR, White-Hat Outreach & Measurement Plan */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-100 pb-4 border-b border-slate-800/80">
              Digital PR, Outreach Protocol & Verification Plan
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs">
              <div className="space-y-3">
                <h4 className="font-semibold text-sky-400">Digital PR & Editorial Media Hooks</h4>
                <ul className="space-y-2 text-slate-300">
                  {strategy.digitalPrStrategy.angles.map((a, i) => (
                    <li key={i}>• {a}</li>
                  ))}
                </ul>
                <div className="pt-2">
                  <span className="font-semibold text-slate-200 block mb-1">Data Study Ideas:</span>
                  <ul className="space-y-1 text-slate-400">
                    {strategy.digitalPrStrategy.dataStudyIdeas.map((d, i) => (
                      <li key={i}>↳ {d}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-amber-400">White-Hat Outreach Workflow</h4>
                <ul className="space-y-2 text-slate-300">
                  {strategy.outreachPlan.steps.map((s, i) => (
                    <li key={i}>{i + 1}. {s}</li>
                  ))}
                </ul>
                <div className="pt-2">
                  <span className="font-semibold text-slate-200 block mb-1">Target Personas:</span>
                  <p className="text-slate-400">{strategy.outreachPlan.targetPersonas.join(' · ')}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-emerald-400">Measurement Plan (30/60/90 Days)</h4>
                <ul className="space-y-2 text-slate-300">
                  {strategy.measurementPlan.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Safe Fixes vs Manual Review & Do Not Do Guardrails */}
          <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-100 pb-4 border-b border-slate-800/80">
              Governance Boundaries: Safe Auto-Fixes vs Strictly Prohibited Tactics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs">
              <div className="space-y-2">
                <div className="font-semibold text-emerald-400">Safe Auto-Fixes (Deterministic)</div>
                <p className="text-slate-400 leading-relaxed">
                  Safe to automate without risk of changing brand voice or business logic:
                </p>
                <ul className="space-y-1 text-slate-300">
                  {strategy.safeAutoFixes.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-amber-400">Manual Engineering / Editorial Review</div>
                <p className="text-slate-400 leading-relaxed">
                  Requires human engineering, marketing, or legal sign-off:
                </p>
                <ul className="space-y-1 text-slate-300">
                  {strategy.manualReviewFixes.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-rose-400">Do Not Do (Prohibited Tactics)</div>
                <p className="text-slate-400 leading-relaxed">
                  Strict black-hat techniques that lead to algorithmic penalties:
                </p>
                <ul className="space-y-1 text-slate-300">
                  {strategy.doNotDo.map((d, i) => (
                    <li key={i}>• {d}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const ActionCenterSection: React.FC<{
  issues: SEOIssue[];
  onUpdateStatus: (issueId: string, status: TaskStatus) => void;
}> = ({ issues, onUpdateStatus }) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');

  const statusOrder: TaskStatus[] = ['Pending', 'In Review', 'Approved', 'Applied', 'Verified'];
  const severityRank: Record<string, number> = {
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4,
    PASSED: 5,
  };

  const sortedIssues = [...issues]
    .filter((i) => (statusFilter === 'ALL' ? true : i.taskStatus === statusFilter))
    .sort((a, b) => (severityRank[a.severity] || 9) - (severityRank[b.severity] || 9));

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              SEO Action Center ({issues.length} Prioritized Tasks)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Track remediation workflow from Pending through Verified. Copy contextual AI coding prompts for any task.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === 'ALL' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({issues.length})
            </button>
            {statusOrder.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === st ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st} ({issues.filter((i) => i.taskStatus === st).length})
              </button>
            ))}
          </div>
        </div>

        {sortedIssues.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            No SEO tasks match the selected status filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {sortedIssues.map((task) => (
              <div key={task.id} className="py-5 first:pt-4 last:pb-1 space-y-3 text-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={severityTextStyle(task.severity)}>{task.severity}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-300">{task.category}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-400">Benefit: {task.impactCategory} Impact</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-400">Difficulty: {task.difficulty}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-400">{task.safetyClassification}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-100">{task.title}</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <label htmlFor={`status-${task.id}`} className="sr-only">
                      Task Status
                    </label>
                    <select
                      id={`status-${task.id}`}
                      value={task.taskStatus}
                      onChange={(e) => onUpdateStatus(task.id, e.target.value as TaskStatus)}
                      className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      {statusOrder.map((st) => (
                        <option key={st} value={st}>
                          Status: {st}
                        </option>
                      ))}
                    </select>

                    <CopyPromptButton text={task.fixPrompt} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <span className="text-slate-400 block mb-0.5">Observed Evidence</span>
                    <p className="font-mono text-[11px] text-slate-300 break-words">{task.evidence}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">Recommended Remediation</span>
                    <p className="text-emerald-300/90">{task.recommendedFix}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
