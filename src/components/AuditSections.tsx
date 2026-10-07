import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type {
  SeverityLevel,
  WebsiteAuditResult,
} from '../types/seo';

export function severityTextStyle(severity: SeverityLevel | 'NOT_MEASURED'): string {
  switch (severity) {
    case 'CRITICAL':
      return 'text-rose-400 font-semibold';
    case 'HIGH':
      return 'text-amber-400 font-semibold';
    case 'MEDIUM':
      return 'text-yellow-300 font-medium';
    case 'LOW':
      return 'text-sky-400 font-medium';
    case 'PASSED':
      return 'text-emerald-400 font-medium';
    case 'NOT_MEASURED':
      return 'text-slate-400 font-medium';
  }
}

export function CopyPromptButton({ text, label = 'Copy Fix Prompt' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
      <span>{copied ? 'Copied Prompt' : label}</span>
    </button>
  );
}

export const OverviewSection: React.FC<{
  audit: WebsiteAuditResult;
  onNavigateTab: (tab: string) => void;
}> = ({ audit, onNavigateTab }) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | SeverityLevel>('ALL');

  const filteredIssues =
    severityFilter === 'ALL'
      ? audit.issues
      : audit.issues.filter((i) => i.severity === severityFilter);

  return (
    <div className="space-y-8">
      {/* Data Source Classification Notice */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Diagnostic Integrity & Data Provenance
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {audit.scores.label} All findings below are strictly separated by evidence source.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
            <span>HTTP {audit.statusCode}</span>
            <span aria-hidden="true">·</span>
            <span>{audit.performance.responseTimeMs} ms</span>
            <span aria-hidden="true">·</span>
            <span>{Math.round(audit.performance.htmlSizeBytes / 1024)} KB HTML</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4 text-xs">
          <div>
            <div className="font-semibold text-emerald-400">01. Observed Website Data</div>
            <p className="text-slate-400 mt-1 leading-relaxed">
              Directly parsed from live HTTP headers, HTML DOM, metadata, JSON-LD, robots.txt, and sitemap.xml.
            </p>
          </div>
          <div>
            <div className="font-semibold text-sky-400">02. Google Search Console</div>
            <p className="text-slate-400 mt-1 leading-relaxed">
              Verified clicks, impressions, CTR, and positions when OAuth property is connected (never fabricated).
            </p>
          </div>
          <div>
            <div className="font-semibold text-amber-400">03. AI Recommendations</div>
            <p className="text-slate-400 mt-1 leading-relaxed">
              Strategic topic clusters, title rewrites, and growth plans derived from observed page signals.
            </p>
          </div>
          <div>
            <div className="font-semibold text-slate-300">04. Unmeasured External Metrics</div>
            <p className="text-slate-400 mt-1 leading-relaxed">
              Metrics requiring paid third-party keyword volume APIs or field CrUX telemetry are explicitly marked &ldquo;Not measured&rdquo;.
            </p>
          </div>
        </div>
      </div>

      {/* Technology Stack & Crawl Summary */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Detected Website Technology Stack</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
              {audit.technologies.map((tech, idx) => (
                <React.Fragment key={tech.name}>
                  {idx > 0 && <span className="text-slate-600" aria-hidden="true">·</span>}
                  <span>
                    <strong className="text-slate-100">{tech.name}</strong>{' '}
                    <span className="text-slate-400">({tech.category} / {tech.confidence} confidence)</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('ai-growth')}
              className="px-4 py-2 text-xs font-medium text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              Open AI SEO Growth Engine
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('safe-fixes')}
              className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              Review Safe Auto-Fixes
            </button>
          </div>
        </div>
      </div>

      {/* SEO Health Breakdown & Prioritized Issues */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Observed SEO Issues & Evidence ({filteredIssues.length})
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Every issue includes verified DOM/HTTP evidence, impact category, safety classification, and an AI coding fix prompt.
            </p>
          </div>

          {/* Interactive Filter Controls */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setSeverityFilter(level)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  severityFilter === level
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {filteredIssues.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-300">No issues found matching filter {severityFilter}.</p>
            <p className="text-xs text-slate-500 mt-1">Select &ldquo;ALL&rdquo; or inspect the passed technical checks.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredIssues.map((issue) => (
              <div key={issue.id} className="py-5 first:pt-4 last:pb-1 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={severityTextStyle(issue.severity)}>{issue.severity}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-300">{issue.category}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-400">Impact: {issue.impactCategory}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-400">Difficulty: {issue.difficulty}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="text-slate-400">{issue.safetyClassification}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-slate-100">{issue.title}</h4>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <CopyPromptButton text={issue.fixPrompt} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
                  <div>
                    <span className="text-slate-400 font-medium block mb-1">Observed Evidence</span>
                    <p className="text-slate-200 font-mono text-[11px] leading-relaxed break-words">
                      {issue.evidence}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block mb-1">Why It Matters</span>
                    <p className="text-slate-300 leading-relaxed">{issue.whyItMatters}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-medium block mb-1">Recommended Fix</span>
                    <p className="text-emerald-300/90 leading-relaxed">{issue.recommendedFix}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                  <span>Affected URL: {issue.affectedUrl}</span>
                  <span aria-hidden="true">·</span>
                  <span>Source: {issue.dataSource.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const TechnicalAuditSection: React.FC<{ audit: WebsiteAuditResult }> = ({ audit }) => {
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const groups = Array.from(new Set(audit.technicalChecks.map((c) => c.group)));

  const visibleChecks =
    groupFilter === 'ALL'
      ? audit.technicalChecks
      : audit.technicalChecks.filter((c) => c.group === groupFilter);

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Technical SEO & Indexability Audit</h2>
            <p className="text-xs text-slate-400 mt-1">
              Direct inspection of protocol security, canonicalization, robots directives, headings, metadata, and structured data.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setGroupFilter('ALL')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                groupFilter === 'ALL' ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({audit.technicalChecks.length})
            </button>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupFilter(g)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                  groupFilter === g ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {g.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-3 pr-4 font-medium">Check Parameter</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Observed Value</th>
                <th className="py-3 pl-4 font-medium">Technical Explanation & Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {visibleChecks.map((check) => (
                <tr key={check.id} className="hover:bg-slate-900/40">
                  <td className="py-3.5 pr-4 align-top">
                    <div className="font-semibold text-slate-100">{check.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{check.group}</div>
                  </td>
                  <td className="py-3.5 px-4 align-top whitespace-nowrap font-mono">
                    <span className={severityTextStyle(check.status)}>
                      {check.status === 'NOT_MEASURED' ? 'Not measured' : check.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 align-top font-mono text-[11px] text-slate-200 max-w-xs break-words">
                    {check.observedValue}
                  </td>
                  <td className="py-3.5 pl-4 align-top text-slate-300 leading-relaxed">
                    <p>{check.explanation}</p>
                    {check.recommendation && (
                      <p className="text-emerald-400 mt-1">Fix: {check.recommendation}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Indexability & Crawlability Deep-Dive */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <h3 className="text-sm font-semibold text-slate-100">
            Indexability & Crawl Directives Summary
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Verdict:</span>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-mono font-semibold ${
                audit.metadata.indexabilityVerdict === 'Indexable'
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                  : audit.metadata.indexabilityVerdict === 'Conditionally Indexable'
                  ? 'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                  : 'bg-rose-950/80 text-rose-400 border border-rose-800/80'
              }`}
            >
              {audit.metadata.indexabilityVerdict || 'Indexable'}
            </span>
          </div>
        </div>

        {audit.metadata.indexabilityReason && (
          <div className="my-3 p-3 bg-slate-900/80 border border-slate-800 rounded text-xs text-slate-300">
            <span className="text-slate-500 font-mono">Evidence: </span>
            {audit.metadata.indexabilityReason}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2 text-xs">
          <div className="space-y-1.5">
            <div className="text-slate-400">Canonical Tag</div>
            <div className="font-mono text-slate-100 break-all">
              {audit.metadata.canonical || 'Missing <link rel="canonical">'}
            </div>
            <p className="text-slate-400">
              Status: {audit.metadata.canonicalStatus}
              {audit.metadata.multipleCanonical && (
                <span className="text-rose-400 font-semibold block">Multiple canonical tags found!</span>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="text-slate-400">Robots Directives</div>
            <div className="font-mono text-slate-100">
              {audit.metadata.robotsDirectives?.length
                ? audit.metadata.robotsDirectives.join(', ')
                : 'index, follow (default)'}
            </div>
            <p className="text-slate-400">
              Meta: {audit.metadata.robotsMeta || 'None'} · X-Robots: {audit.metadata.xRobotsTag || 'None'}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="text-slate-400">robots.txt Inspection</div>
            <div className="font-mono text-slate-100">
              {audit.robotsTxt.available ? `HTTP 200 (${audit.robotsTxt.status})` : `${audit.robotsTxt.status}`}
            </div>
            <p className="text-slate-400">
              Disallow Root: {audit.robotsTxt.blocksCurrentPath ? 'Yes (CRITICAL)' : 'No'} · Sitemaps:{' '}
              {audit.robotsTxt.sitemapReferences.length}
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="text-slate-400">XML Sitemap Inspection</div>
            <div className="font-mono text-slate-100">
              {audit.sitemapXml.status === 'Found'
                ? `${audit.sitemapXml.status} (${audit.sitemapXml.format})`
                : `${audit.sitemapXml.status}`}
            </div>
            <p className="text-slate-400 break-all">
              {audit.sitemapXml.urlCount !== null && audit.sitemapXml.urlCount !== undefined
                ? `~${audit.sitemapXml.urlCount} URLs detected`
                : `Checked ${audit.sitemapXml.checkedUrl}`}
            </p>
          </div>
        </div>

        {audit.crawledPages.length > 1 && (
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <h4 className="text-xs font-semibold text-slate-200 mb-3">
              Multi-Page Crawl Snapshot ({audit.crawledPages.length} Pages Inspected)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3">URL</th>
                    <th className="py-2 px-3">HTTP</th>
                    <th className="py-2 px-3">Title</th>
                    <th className="py-2 px-3">H1</th>
                    <th className="py-2 px-3 text-right">Words</th>
                    <th className="py-2 pl-3">Indexable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {audit.crawledPages.map((p) => (
                    <tr key={p.url}>
                      <td className="py-2 pr-3 text-slate-200 max-w-xs truncate">{p.url}</td>
                      <td className="py-2 px-3 text-emerald-400 tabular-nums">{p.statusCode}</td>
                      <td className="py-2 px-3 text-slate-300 font-sans max-w-xs truncate">{p.title}</td>
                      <td className="py-2 px-3 text-slate-300 font-sans max-w-xs truncate">{p.h1}</td>
                      <td className="py-2 px-3 text-right text-slate-300 tabular-nums">{p.wordCount}</td>
                      <td className="py-2 pl-3 text-slate-200">{p.indexable ? 'Yes' : 'Blocked'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const OnPageAuditSection: React.FC<{ audit: WebsiteAuditResult }> = ({ audit }) => {
  const [showHeadings, setShowHeadings] = useState(true);

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="pb-4 border-b border-slate-800/80">
          <h2 className="text-base font-semibold text-slate-100">On-Page SEO Diagnostic Matrix</h2>
          <p className="text-xs text-slate-400 mt-1">
            Evaluation of title tag, meta description, heading hierarchy, content depth, anchor text, and suggested implementation code.
          </p>
        </div>

        <div className="divide-y divide-slate-800/80">
          {audit.onPageItems.map((item) => (
            <div key={item.id} className="py-5 first:pt-4 last:pb-1 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className={severityTextStyle(item.status)}>{item.status}</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <h3 className="text-sm font-semibold text-slate-100">{item.element}</h3>
                </div>
                <CopyPromptButton
                  text={`Update ${item.element} on ${audit.finalUrl}.\nCurrent: ${item.currentState}\nProblem: ${item.problem}\nRecommended: ${item.recommendedChange}\nSuggested Code: ${item.suggestedImplementation}`}
                  label="Copy Fix Prompt"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Current Observed State</span>
                  <p className="font-mono text-[11px] text-slate-200 break-words">{item.currentState}</p>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Diagnosis</span>
                  <p className="text-slate-300">{item.problem}</p>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Why It Matters</span>
                  <p className="text-slate-300">{item.whyItMatters}</p>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Recommended Change</span>
                  <p className="text-emerald-300/90">{item.recommendedChange}</p>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800/90 rounded p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                <span className="text-slate-500 select-none">Suggested Implementation: </span>
                {item.suggestedImplementation}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Observed Heading Outline */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <button
          type="button"
          onClick={() => setShowHeadings(!showHeadings)}
          className="w-full flex items-center justify-between text-left cursor-pointer"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Observed Heading Hierarchy (H1: {audit.headings.h1.length} · H2: {audit.headings.h2.length} · H3: {audit.headings.h3.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Complete outline of primary and secondary headings extracted from the live DOM.
            </p>
          </div>
          {showHeadings ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showHeadings && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div>
              <div className="font-semibold text-slate-200 mb-2">H1 Headings ({audit.headings.h1.length})</div>
              {audit.headings.h1.length === 0 ? (
                <p className="text-rose-400">No H1 tags found on page.</p>
              ) : (
                <ul className="space-y-1.5 text-slate-300 font-mono text-[11px]">
                  {audit.headings.h1.map((h, i) => (
                    <li key={i}>H1 · {h}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-2">H2 Subheadings ({audit.headings.h2.length})</div>
              {audit.headings.h2.length === 0 ? (
                <p className="text-amber-400">No H2 subheadings found.</p>
              ) : (
                <ul className="space-y-1.5 text-slate-300 font-mono text-[11px]">
                  {audit.headings.h2.slice(0, 10).map((h, i) => (
                    <li key={i}>H2 · {h}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="font-semibold text-slate-200 mb-2">H3 Subheadings ({audit.headings.h3.length})</div>
              {audit.headings.h3.length === 0 ? (
                <p className="text-slate-500">No H3 subheadings found.</p>
              ) : (
                <ul className="space-y-1.5 text-slate-300 font-mono text-[11px]">
                  {audit.headings.h3.slice(0, 10).map((h, i) => (
                    <li key={i}>H3 · {h}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Image Alt Text & Accessibility Audit (Prompt 2 Section 14) */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Image Alt Text & Media Audit ({audit.images.totalImages} Images Found)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              WCAG accessibility compliance and image search ranking signals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
            <span className="text-emerald-400">With Alt: {audit.images.imagesWithAlt}</span>
            <span aria-hidden="true">·</span>
            <span className={audit.images.imagesWithoutAlt > 0 ? 'text-rose-400' : 'text-slate-400'}>
              Missing Alt: {audit.images.imagesWithoutAlt}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-400">Decorative (alt=""): {audit.images.imagesWithEmptyAlt}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-300 font-semibold">{audit.images.coveragePercent}% Coverage</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {audit.images.decorativeGuidance}
        </p>

        {audit.images.sampleImages.length > 0 && (
          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4">Image Source (src)</th>
                  <th className="py-2 px-4">Alt Attribute Value</th>
                  <th className="py-2 pl-4">Status & Accessibility Classification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {audit.images.sampleImages.slice(0, 10).map((img, i) => (
                  <tr key={i} className="hover:bg-slate-900/40">
                    <td className="py-2.5 pr-4 text-slate-300 max-w-xs truncate">{img.src}</td>
                    <td className="py-2.5 px-4 text-slate-100">
                      {img.alt === null ? (
                        <span className="text-rose-400 font-sans">Missing alt attribute</span>
                      ) : img.alt === '' ? (
                        <span className="text-amber-400 font-sans italic">alt="" (decorative)</span>
                      ) : (
                        <span>&ldquo;{img.alt}&rdquo;</span>
                      )}
                    </td>
                    <td className="py-2.5 pl-4 font-sans">
                      {img.alt === null ? (
                        <span className="text-rose-400 font-medium">Needs Descriptive Alt Text</span>
                      ) : img.alt === '' ? (
                        <span className="text-slate-400">Decorative / WCAG Valid</span>
                      ) : (
                        <span className="text-emerald-400">Descriptive Alt Present</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Open Graph & Social Card Preview (Prompt 2 Section 16) */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Open Graph & Social Share Preview
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulated preview on social feeds based strictly on verified og:* and twitter:* tags.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
            <span>OG Tags: {audit.metadata.openGraph.presentCount}</span>
            <span aria-hidden="true">·</span>
            <span>Twitter Tags: {audit.metadata.twitterCard.presentCount}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Card Preview */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden max-w-md">
            {audit.metadata.openGraph.tags['og:image'] || audit.metadata.twitterCard.tags['twitter:image'] ? (
              <img
                src={audit.metadata.openGraph.tags['og:image'] || audit.metadata.twitterCard.tags['twitter:image']}
                alt="Social preview"
                className="w-full h-40 object-cover bg-slate-900 border-b border-slate-800"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-full h-32 bg-slate-900/60 flex items-center justify-center text-xs text-slate-500 border-b border-slate-800">
                No og:image tag found in DOM
              </div>
            )}
            <div className="p-4 space-y-1.5">
              <span className="text-[10px] font-mono uppercase text-slate-500 block truncate">
                {audit.finalUrl}
              </span>
              <h4 className="text-sm font-semibold text-slate-100 line-clamp-2">
                {audit.metadata.openGraph.tags['og:title'] || audit.metadata.title || 'Untitled Webpage'}
              </h4>
              <p className="text-xs text-slate-400 line-clamp-2">
                {audit.metadata.openGraph.tags['og:description'] ||
                  audit.metadata.metaDescription ||
                  'No description provided.'}
              </p>
            </div>
          </div>

          {/* Social Tags Matrix */}
          <div className="space-y-2 text-xs">
            <h4 className="font-semibold text-slate-200 mb-2">Extracted Social Protocol Tags</h4>
            <div className="space-y-1.5 font-mono text-[11px]">
              {[
                { tag: 'og:title', val: audit.metadata.openGraph.tags['og:title'] },
                { tag: 'og:description', val: audit.metadata.openGraph.tags['og:description'] },
                { tag: 'og:image', val: audit.metadata.openGraph.tags['og:image'] },
                { tag: 'og:url', val: audit.metadata.openGraph.tags['og:url'] },
                { tag: 'og:type', val: audit.metadata.openGraph.tags['og:type'] },
                { tag: 'twitter:card', val: audit.metadata.twitterCard.tags['twitter:card'] },
                { tag: 'twitter:title', val: audit.metadata.twitterCard.tags['twitter:title'] },
              ].map((s) => (
                <div key={s.tag} className="flex items-start justify-between gap-2 p-1.5 rounded bg-slate-900/60 border border-slate-800/60">
                  <span className="text-slate-400 shrink-0">{s.tag}</span>
                  <span className={`truncate text-right ${s.val ? 'text-slate-200' : 'text-slate-600'}`}>
                    {s.val ? s.val : 'Missing'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ContentIntelligenceSection: React.FC<{ audit: WebsiteAuditResult }> = ({ audit }) => {
  const ci = audit.contentIntelligence;

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <span className="text-amber-300 font-medium">{ci.searchVolumeDisclaimer}</span>
        <span className="text-slate-400 font-mono shrink-0">
          Observed Depth: {ci.wordCount} words · {ci.sentenceCount} sentences
        </span>
      </div>

      {/* Primary Topic, Intent & Readability */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <h2 className="text-base font-semibold text-slate-100 pb-4 border-b border-slate-800/80">
          Observed Content & Topic Intelligence
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 text-xs">
          <div>
            <span className="text-slate-400 block mb-1">Primary Observed Topic</span>
            <div className="text-sm font-semibold text-slate-100">{ci.primaryTopic}</div>
            <p className="text-slate-400 mt-2">
              Secondary Signals: {ci.secondaryTopics.join(' · ') || 'None detected'}
            </p>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Probable Search Intent</span>
            <div className="text-sm font-semibold text-emerald-400">{ci.probableSearchIntent} Intent</div>
            <p className="text-slate-400 mt-2">
              Aligned with Goal: <strong className="text-slate-200">{audit.primaryGoal}</strong> ({audit.targetMarket})
            </p>
          </div>
          <div>
            <span className="text-slate-400 block mb-1">Readability & Structure Analysis</span>
            <p className="text-slate-300 leading-relaxed">{ci.readabilitySummary}</p>
          </div>
        </div>

        {/* Observed Term Frequencies */}
        {ci.topObservedTerms.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-800/80">
            <h3 className="text-xs font-semibold text-slate-200 mb-3">
              Observed On-Page Term Frequency (Extracted from Live Body Text)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-4">Observed Term</th>
                    <th className="py-2 px-4 text-right">Occurrences</th>
                    <th className="py-2 px-4 text-right">Observed Density</th>
                    <th className="py-2 pl-4">Global Search Volume</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {ci.topObservedTerms.map((t) => (
                    <tr key={t.term}>
                      <td className="py-2 pr-4 text-slate-100 font-medium">{t.term}</td>
                      <td className="py-2 px-4 text-right text-slate-300 tabular-nums">{t.count}</td>
                      <td className="py-2 px-4 text-right text-emerald-400 tabular-nums">{t.densityPercent}%</td>
                      <td className="py-2 pl-4 text-slate-500 font-sans">Not measured (no keyword API connected)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Topic Cluster Blueprint */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
        <div className="pb-4 border-b border-slate-800/80">
          <h3 className="text-base font-semibold text-slate-100">
            Recommended Topic Cluster & Internal Link Blueprint
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Pillar Page: <strong className="text-slate-200">{ci.topicCluster.pillarPage}</strong> ({ci.topicCluster.pillarTargetUrl})
          </p>
        </div>

        <div className="divide-y divide-slate-800/80">
          {ci.topicCluster.supportingArticles.map((article, idx) => (
            <div key={idx} className="py-4 first:pt-1 last:pb-1 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-emerald-400">0{idx + 1}.</span>
                <span className="font-semibold text-slate-100 text-sm">{article.title}</span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-400">{article.intent} Intent</span>
              </div>
              <p className="text-slate-300">{article.rationale}</p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400 pt-1">
                <span>Link From: {article.suggestedInternalLinkFrom}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300">Suggested Anchor: &ldquo;{article.suggestedAnchorText}&rdquo;</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content Gaps & Intent Opportunities */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-100 pb-4 border-b border-slate-800/80">
          Content Gaps & Search Intent Expansion Opportunities
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 text-xs">
          <div>
            <div className="font-semibold text-slate-200 mb-2">Observed Content Gaps</div>
            <ul className="space-y-2 text-slate-300">
              {ci.contentGaps.map((g, i) => (
                <li key={i} className="leading-relaxed">• {g}</li>
              ))}
            </ul>
            <div className="font-semibold text-slate-200 mt-5 mb-2">Missing Supporting Pages</div>
            <ul className="space-y-1.5 text-slate-300">
              {ci.missingSupportingPages.map((p, i) => (
                <li key={i}>• {p}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <div>
              <span className="font-semibold text-slate-200 block">Informational Opportunities</span>
              <p className="text-slate-400 mt-0.5">{ci.intentOpportunities.informational.join(' · ')}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-200 block">Commercial Investigation Opportunities</span>
              <p className="text-slate-400 mt-0.5">{ci.intentOpportunities.commercial.join(' · ')}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-200 block">Transactional Opportunities</span>
              <p className="text-slate-400 mt-0.5">{ci.intentOpportunities.transactional.join(' · ')}</p>
            </div>
            <div>
              <span className="font-semibold text-slate-200 block">Navigational Architecture</span>
              <p className="text-slate-400 mt-0.5">{ci.intentOpportunities.navigational.join(' · ')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const InternalLinkingSection: React.FC<{ audit: WebsiteAuditResult }> = ({ audit }) => {
  const il = audit.internalLinking;

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Internal Linking Engine & Anchor Analysis</h2>
            <p className="text-xs text-slate-400 mt-1">{il.orphanDetectionNote}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
            <span>Internal: {il.totalInternalLinks}</span>
            <span aria-hidden="true">·</span>
            <span>Unique Targets: {il.uniqueInternalTargets}</span>
            <span aria-hidden="true">·</span>
            <span>External: {il.totalExternalLinks} ({il.uniqueExternalDomains} domains)</span>
            <span aria-hidden="true">·</span>
            <span className={il.emptyAnchorCount > 0 ? 'text-amber-400' : ''}>Empty Anchors: {il.emptyAnchorCount}</span>
            <span aria-hidden="true">·</span>
            <span className={il.emptyHrefCount > 0 ? 'text-rose-400' : ''}>Empty href: {il.emptyHrefCount}</span>
            <span aria-hidden="true">·</span>
            <span>Fragment (#): {il.fragmentOnlyCount}</span>
          </div>
        </div>

        {/* Recommendations based strictly on real observed URLs */}
        <div className="pt-4">
          <h3 className="text-xs font-semibold text-slate-200 mb-3">
            Internal Link Optimization Recommendations (Verified Observed URLs Only)
          </h3>
          {il.recommendations.length === 0 ? (
            <p className="text-xs text-slate-400">
              No additional internal link target URLs were observed on this page. Add navigation and contextual links to your core pages.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-4">Source Page</th>
                    <th className="py-2.5 px-4">Target Page (Observed)</th>
                    <th className="py-2.5 px-4">Suggested Anchor Text</th>
                    <th className="py-2.5 pl-4">SEO Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {il.recommendations.map((rec, i) => (
                    <tr key={i}>
                      <td className="py-3 pr-4 font-mono text-[11px] text-slate-300 max-w-[200px] truncate">
                        {rec.sourcePage}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-emerald-400 max-w-[240px] truncate">
                        {rec.targetPage}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-100">&ldquo;{rec.suggestedAnchor}&rdquo;</td>
                      <td className="py-3 pl-4 text-slate-300">{rec.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Observed Link Distribution Table */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-100 pb-4 border-b border-slate-800/80">
          Observed Links on Page ({il.observedLinks.length} Unique Destination URLs)
        </h3>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4">Destination URL</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Observed Anchor Text</th>
                <th className="py-2.5 px-4">Rel Attribute</th>
                <th className="py-2.5 pl-4 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {il.observedLinks.slice(0, 45).map((lnk) => (
                <tr key={lnk.href} className="hover:bg-slate-900/40">
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-slate-200 max-w-xs truncate">
                    <a
                      href={lnk.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-emerald-400 inline-flex items-center gap-1"
                    >
                      <span className="truncate max-w-[260px]">{lnk.href}</span>
                      <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                    </a>
                  </td>
                  <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                    {lnk.isInternal ? 'Internal' : 'External'}
                  </td>
                  <td className="py-2.5 px-4 text-slate-200 max-w-xs truncate">{lnk.anchorText}</td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{lnk.rel || 'follow'}</td>
                  <td className="py-2.5 pl-4 text-right font-mono text-slate-200 tabular-nums">{lnk.occurrences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* External Outbound Links & Rel Attributes Audit */}
      {il.externalLinks && il.externalLinks.length > 0 && (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Sample External Links & Rel Attributes ({il.externalLinks.length} Sampled Links)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Outbound link audit with nofollow, sponsored, and ugc attribute detection.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {il.uniqueExternalDomains} Unique Destination Domains
            </span>
          </div>

          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 pr-4">External Target URL</th>
                  <th className="py-2.5 px-4">Domain</th>
                  <th className="py-2.5 px-4">Anchor Text</th>
                  <th className="py-2.5 px-4">Rel Flags</th>
                  <th className="py-2.5 pl-4 text-right">Occurrences</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {il.externalLinks.slice(0, 20).map((ext) => (
                  <tr key={ext.href} className="hover:bg-slate-900/40">
                    <td className="py-2.5 pr-4 text-slate-200 max-w-xs truncate">
                      <a
                        href={ext.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-emerald-400 inline-flex items-center gap-1"
                      >
                        <span className="truncate max-w-[240px]">{ext.href}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 text-slate-500" />
                      </a>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{ext.domain}</td>
                    <td className="py-2.5 px-4 text-slate-300 font-sans">{ext.anchorText}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {ext.isNofollow && (
                          <span className="px-1.5 py-0.2 bg-amber-950/80 text-amber-400 rounded text-[10px]">
                            nofollow
                          </span>
                        )}
                        {ext.isSponsored && (
                          <span className="px-1.5 py-0.2 bg-purple-950/80 text-purple-400 rounded text-[10px]">
                            sponsored
                          </span>
                        )}
                        {ext.isUgc && (
                          <span className="px-1.5 py-0.2 bg-sky-950/80 text-sky-400 rounded text-[10px]">
                            ugc
                          </span>
                        )}
                        {!ext.isNofollow && !ext.isSponsored && !ext.isUgc && (
                          <span className="text-slate-500">follow</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pl-4 text-right text-slate-200 tabular-nums">{ext.occurrences}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const StructuredDataSection: React.FC<{ audit: WebsiteAuditResult }> = ({ audit }) => {
  const sd = audit.structuredData;

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Schema.org & JSON-LD Structured Data Audit</h2>
            <p className="text-xs text-slate-400 mt-1">{sd.contentAlignmentNote}</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-300">
            <span>Detected Blocks: {sd.detectedScriptsCount}</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">Valid: {sd.validCount}</span>
            <span aria-hidden="true">·</span>
            <span className={sd.invalidCount > 0 ? 'text-rose-400' : 'text-slate-400'}>
              Invalid: {sd.invalidCount}
            </span>
          </div>
        </div>

        {sd.items.length === 0 ? (
          <div className="py-6 text-xs text-slate-300 space-y-2">
            <p className="text-amber-400 font-medium">
              No &lt;script type=&quot;application/ld+json&quot;&gt; structured data blocks were detected on {audit.finalUrl}.
            </p>
            <p className="text-slate-400">
              Note: ZyvenSEO never fabricates business addresses, phone numbers, or fake review ratings. Implement the recommended schema types below using your verified organization details.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80 mt-2">
            {sd.items.map((item) => (
              <div key={item.index} className="py-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-400">Block #{item.index}</span>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-100">{item.types.join(', ')}</span>
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className={item.valid ? 'text-emerald-400 font-medium' : 'text-rose-400 font-semibold'}>
                      {item.valid ? 'Valid JSON-LD Syntax' : 'Invalid / Incomplete'}
                    </span>
                  </div>
                </div>
                {item.issues.length > 0 && (
                  <ul className="text-rose-400 space-y-1">
                    {item.issues.map((iss, idx) => (
                      <li key={idx}>• {iss}</li>
                    ))}
                  </ul>
                )}
                <pre className="bg-slate-950 border border-slate-800/80 rounded p-3 font-mono text-[11px] text-slate-300 overflow-x-auto">
                  {item.rawPreview}
                </pre>
              </div>
            ))}
          </div>
        )}

        {/* Suggested Schema Types */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <h3 className="text-xs font-semibold text-slate-200 mb-3">
            Recommended Schema.org Entity Types for This Page
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {sd.suggestedSchemaTypes.map((s) => (
              <div key={s.type} className="space-y-1">
                <div className="font-mono font-semibold text-emerald-400">{s.type}</div>
                <p className="text-slate-300 leading-relaxed">{s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const PerformanceAndOffPageSection: React.FC<{ audit: WebsiteAuditResult }> = ({ audit }) => {
  const perf = audit.performance;

  return (
    <div className="space-y-6">
      {/* Performance Signals */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="pb-4 border-b border-slate-800/80">
          <h2 className="text-base font-semibold text-slate-100">
            Observable Performance Signals & Resource Audit
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Strictly reports observed HTTP/HTML resource metrics. Real-user CrUX Core Web Vitals are never fabricated.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 py-4 border-b border-slate-800/80 text-xs">
          <div>
            <span className="text-slate-400 block">Server Response</span>
            <span className="text-base font-mono font-semibold text-slate-100 tabular-nums mt-0.5 block">
              {perf.responseTimeMs} ms
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">HTML Payload</span>
            <span className="text-base font-mono font-semibold text-slate-100 tabular-nums mt-0.5 block">
              {(perf.htmlSizeBytes / 1024).toFixed(1)} KB
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Render-Blocking JS</span>
            <span className="text-base font-mono font-semibold text-slate-100 tabular-nums mt-0.5 block">
              {perf.renderBlockingScripts} / {perf.totalScripts}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Un-Lazy Images</span>
            <span className="text-base font-mono font-semibold text-slate-100 tabular-nums mt-0.5 block">
              {perf.imagesWithoutLazyLoad} / {perf.totalImages}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Compression</span>
            <span className="text-sm font-mono font-semibold text-emerald-400 mt-1 block truncate">
              {perf.compressionHeader}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block">Stylesheets</span>
            <span className="text-base font-mono font-semibold text-slate-100 tabular-nums mt-0.5 block">
              {perf.stylesheetCount}
            </span>
          </div>
        </div>

        {/* Unmeasured Metrics Honesty Table */}
        <div className="py-4 border-b border-slate-800/80">
          <h3 className="text-xs font-semibold text-slate-200 mb-2">
            Browser Telemetry Metrics (Explicitly Not Measured Without External CrUX API)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {perf.unmeasuredMetrics.map((u) => (
              <div key={u.metric} className="space-y-1">
                <div className="font-medium text-slate-200">
                  {u.metric} <span className="text-slate-500">· Not measured</span>
                </div>
                <p className="text-slate-400">{u.reason}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="pt-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-200">Performance Action Recommendations</h3>
          <div className="divide-y divide-slate-800/70 text-xs">
            {perf.recommendations.map((rec, i) => (
              <div key={i} className="py-3 first:pt-1 last:pb-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={severityTextStyle(rec.severity)}>{rec.severity}</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="font-semibold text-slate-100">{rec.title}</span>
                </div>
                <p className="text-slate-400 font-mono text-[11px]">{rec.observedEvidence}</p>
                <p className="text-slate-200">{rec.action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Authority & Off-Page Strategy */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5">
        <div className="pb-4 border-b border-slate-800/80">
          <h2 className="text-base font-semibold text-slate-100">
            White-Hat Authority & Off-Page SEO Strategy
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Legitimate editorial authority building tailored for &ldquo;{audit.contentIntelligence.primaryTopic}&rdquo; in {audit.targetMarket}.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 text-xs">
          <div className="space-y-3">
            <h3 className="font-semibold text-emerald-400">Recommended Authority Channels</h3>
            <ul className="space-y-2 text-slate-300 leading-relaxed">
              <li>
                <strong className="text-slate-100">01. Original Research & Linkable Assets:</strong> Publish empirical benchmarks, interactive calculators, or open templates addressing {audit.contentIntelligence.primaryTopic} that journalists naturally cite.
              </li>
              <li>
                <strong className="text-slate-100">02. Digital PR & Expert Commentary:</strong> Contribute technical commentary from named subject-matter experts to industry trade publications in {audit.targetMarket}.
              </li>
              <li>
                <strong className="text-slate-100">03. Curated Resource & Documentation Pages:</strong> Earn inclusion on university, documentation, and ecosystem partner directories through genuine utility.
              </li>
              <li>
                <strong className="text-slate-100">04. Strategic Co-Marketing Partnerships:</strong> Partner with complementary non-competing platforms for joint technical webinars and research guides.
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-rose-400">Strictly Prohibited Black-Hat Tactics (Never Recommended)</h3>
            <ul className="space-y-2 text-slate-300 leading-relaxed">
              <li>• Never purchase spam backlink packages, link farm placements, or Private Blog Network (PBN) links.</li>
              <li>• Never run automated blog comment spam, forum profile blasts, or mass low-quality directory submissions.</li>
              <li>• Never publish fabricated customer reviews or misleading AggregateRating structured data.</li>
              <li>• Never deploy doorway pages, hidden text, cloaking, artificial traffic bots, or keyword stuffing.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
