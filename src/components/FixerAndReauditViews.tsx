import React, { useState } from 'react';
import JSZip from 'jszip';
import { Download, Upload, Check, RefreshCw } from 'lucide-react';
import type {
  WebsiteAuditResult,
  ZipAuditAnalysis,
  ZipProposedChange,
} from '../types/seo';
import { requestApplySafeHtmlFixes, getApiBaseUrl, setApiBaseUrl } from '../services/api';
import { inspectAndAnalyzeZip, generateCorrectedZipBlob } from '../services/zipFixer';

export const SafeFixAndZipSection: React.FC<{
  audit?: WebsiteAuditResult;
  onMarkFixesApplied?: (appliedFixIds: string[]) => void;
}> = ({ audit, onMarkFixesApplied }) => {
  const availableFixes = (audit?.issues || [])
    .filter((i) => Boolean(i.proposedFix))
    .map((i) => ({ issue: i, fix: i.proposedFix! }));

  const [selectedFixIds, setSelectedFixIds] = useState<string[]>(
    availableFixes.filter((f) => f.fix.safety === 'SAFE AUTO-FIX').map((f) => f.fix.id)
  );
  const [isApplyingHtml, setIsApplyingHtml] = useState(false);
  const [patchedHtmlResult, setPatchedHtmlResult] = useState<{
    updatedHtml: string;
    appliedChanges: { id: string; description: string }[];
  } | null>(null);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  // ZIP Source Fixer State
  const [uploadedZipFile, setUploadedZipFile] = useState<File | null>(null);
  const [zipAnalysis, setZipAnalysis] = useState<ZipAuditAnalysis | null>(null);
  const [zipChanges, setZipChanges] = useState<ZipProposedChange[]>([]);
  const [zipError, setZipError] = useState<string | null>(null);
  const [isInspectingZip, setIsInspectingZip] = useState(false);
  const [isBuildingZip, setIsBuildingZip] = useState(false);

  const toggleFixId = (id: string) => {
    setSelectedFixIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleApplyHtmlFixes = async () => {
    if (selectedFixIds.length === 0 || !audit) return;
    setIsApplyingHtml(true);
    setHtmlError(null);
    try {
      const res = await requestApplySafeHtmlFixes({
        rawHtml: audit.rawHtmlExcerpt || '<!doctype html><html><head></head><body></body></html>',
        approvedFixIds: selectedFixIds,
        audit,
      });
      setPatchedHtmlResult(res);
      if (onMarkFixesApplied) {
        onMarkFixesApplied(selectedFixIds);
      }
    } catch (e: any) {
      setHtmlError(e.message || 'Could not apply HTML fixes.');
    } finally {
      setIsApplyingHtml(false);
    }
  };

  const handleDownloadPatchedHtml = () => {
    if (!patchedHtmlResult) return;
    const blob = new Blob([patchedHtmlResult.updatedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.seo-fixed.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleZipFileSelect = async (file: File) => {
    setZipError(null);
    setIsInspectingZip(true);
    setUploadedZipFile(file);
    try {
      const { analysis } = await inspectAndAnalyzeZip(file, {
        primaryUrl: audit?.finalUrl || 'https://example.com',
        primaryTopic: audit?.contentIntelligence?.primaryTopic || 'Website SEO Optimization',
      });
      setZipAnalysis(analysis);
      setZipChanges(analysis.proposedChanges);
    } catch (e: any) {
      setZipError(e.message || 'Unable to inspect ZIP archive.');
      setZipAnalysis(null);
    } finally {
      setIsInspectingZip(false);
    }
  };

  const handleGenerateSampleZipAndAnalyze = async () => {
    setZipError(null);
    setIsInspectingZip(true);
    try {
      const sampleZip = new JSZip();
      sampleZip.file(
        'package.json',
        JSON.stringify(
          {
            name: 'sample-nextjs-marketing-site',
            version: '1.0.0',
            dependencies: { next: '15.0.0', react: '19.0.0', 'react-dom': '19.0.0' },
          },
          null,
          2
        )
      );
      sampleZip.file('next.config.mjs', 'export default { reactStrictMode: true };\n');
      sampleZip.file(
        'app/layout.tsx',
        `import React from 'react';\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html>\n      <body>{children}</body>\n    </html>\n  );\n}\n`
      );
      sampleZip.file(
        'public/landing.html',
        `<!doctype html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n  </head>\n  <body>\n    <h1>${audit?.contentIntelligence?.primaryTopic || 'Platform Architecture & Optimization'}</h1>\n    <p>Welcome to our official platform.</p>\n  </body>\n</html>`
      );

      const blob = await sampleZip.generateAsync({ type: 'blob' });
      const sampleFile = new File([blob], 'website-source-bundle.zip', { type: 'application/zip' });
      await handleZipFileSelect(sampleFile);
    } catch (e: any) {
      setZipError(e.message || 'Could not generate sample project archive.');
      setIsInspectingZip(false);
    }
  };

  const toggleZipChangeApproval = (id: string) => {
    setZipChanges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, approved: !c.approved } : c))
    );
  };

  const handleDownloadCorrectedZip = async () => {
    if (!uploadedZipFile || zipChanges.length === 0) return;
    setIsBuildingZip(true);
    try {
      const blob = await generateCorrectedZipBlob(uploadedZipFile, zipChanges);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = uploadedZipFile.name.replace(/\.zip$/i, '');
      a.download = `${baseName}-zyvenseo-corrected.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setZipError(e.message || 'Failed to build corrected ZIP.');
    } finally {
      setIsBuildingZip(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Safe Auto-Fix System */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Safe Auto-Fix System (Deterministic HTML Head & Attribute Remediation)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Review proposed changes before applying. Never modifies pricing, legal copy, redirects, authentication, or database logic.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleApplyHtmlFixes}
              disabled={isApplyingHtml || selectedFixIds.length === 0}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {isApplyingHtml
                ? 'Applying Approved Fixes...'
                : `Apply ${selectedFixIds.length} Approved Fix(es)`}
            </button>
          </div>
        </div>

        {/* Safety Classification Legend */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pb-2">
          <div>
            <span className="font-semibold text-emerald-400">SAFE AUTO-FIX</span>
            <p className="text-slate-400 mt-0.5">
              Missing title, meta description, viewport, HTML lang, canonical placeholder, and fallback image alt attributes.
            </p>
          </div>
          <div>
            <span className="font-semibold text-amber-400">REVIEW REQUIRED</span>
            <p className="text-slate-400 mt-0.5">
              Existing title/description length rewrites, H1 consolidation, and structured data additions.
            </p>
          </div>
          <div>
            <span className="font-semibold text-rose-400">MANUAL ONLY (Never Auto-Modified)</span>
            <p className="text-slate-400 mt-0.5">
              Business-critical copy, pricing, legal disclosures, server redirects, robots rules, auth, and DB logic.
            </p>
          </div>
        </div>

        {availableFixes.length === 0 ? (
          <div className="py-6 text-xs text-slate-300">
            {audit
              ? `All deterministic head metadata checks (title, meta description, canonical, viewport, lang, image alt) already passed on ${audit.finalUrl}.`
              : 'Audit a live webpage above to generate single-page HTML patches, or upload your project archive below for full-source ZIP fixing.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {availableFixes.map(({ issue, fix }) => {
              const checked = selectedFixIds.includes(fix.id);
              return (
                <div key={fix.id} className="py-4 space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFixId(fix.id)}
                        className="w-4 h-4 accent-emerald-400 rounded cursor-pointer"
                      />
                      <span className="font-semibold text-slate-100 text-sm">{fix.label}</span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span
                        className={
                          fix.safety === 'SAFE AUTO-FIX' ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'
                        }
                      >
                        {fix.safety}
                      </span>
                    </label>
                    <span className="text-slate-400">{issue.title}</span>
                  </div>

                  <p className="text-slate-300">{fix.reason}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                    <div className="bg-slate-950 border border-slate-800/90 rounded p-3 overflow-x-auto">
                      <div className="text-rose-400 mb-1 font-sans text-[11px] font-medium">Current Code</div>
                      <code className="text-slate-300 break-all">{fix.currentCode}</code>
                    </div>
                    <div className="bg-slate-950 border border-slate-800/90 rounded p-3 overflow-x-auto">
                      <div className="text-emerald-400 mb-1 font-sans text-[11px] font-medium">Proposed Code</div>
                      <code className="text-emerald-200 break-all">{fix.proposedCode}</code>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {htmlError && <p className="text-xs text-rose-400">{htmlError}</p>}

        {patchedHtmlResult && (
          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-emerald-400">
                  Applied {patchedHtmlResult.appliedChanges.length} Deterministic Fix(es) to HTML Snapshot
                </h3>
                <ul className="text-xs text-slate-300 mt-1 space-y-0.5">
                  {patchedHtmlResult.appliedChanges.map((c) => (
                    <li key={c.id}>✓ {c.description}</li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={handleDownloadPatchedHtml}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Corrected HTML</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Website Source / ZIP Fixer */}
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Website Source / ZIP Fixer (Browser-Side Safe Inspection & Remediation)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload your website source archive (.zip) to detect framework conventions (Next.js, Static HTML, Vite, React, Astro, Shopify, WordPress), review file-by-file diffs, and generate a Corrected ZIP without overwriting your original archive.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-md transition-colors cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Website Source ZIP</span>
              <input
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleZipFileSelect(f);
                }}
              />
            </label>

            <button
              type="button"
              onClick={handleGenerateSampleZipAndAnalyze}
              className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              Load Sample Project ZIP
            </button>
          </div>
        </div>

        {isInspectingZip && (
          <div className="py-6 text-xs font-mono text-emerald-400">
            Inspecting ZIP structure, verifying path safety, and detecting framework SEO entry points...
          </div>
        )}

        {zipError && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/70 rounded text-xs text-rose-300">
            {zipError}
          </div>
        )}

        {zipAnalysis && !isInspectingZip && (
          <div className="space-y-6">
            {/* Framework & Entry Points Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs pt-1">
              <div>
                <span className="text-slate-400 block">Archive Inspected</span>
                <span className="font-mono font-semibold text-slate-100 mt-0.5 block">
                  {zipAnalysis.fileName} ({zipAnalysis.totalFilesInspected} files)
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Detected Framework</span>
                <span className="font-semibold text-emerald-400 mt-0.5 block">
                  {zipAnalysis.detectedFramework} ({zipAnalysis.frameworkConfidence} confidence)
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Detected Entry Points</span>
                <span className="font-mono text-[11px] text-slate-200 mt-0.5 block break-all">
                  {zipAnalysis.entryPoints.join(', ') || 'Root HTML / templates'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Files Relevant to SEO</span>
                <span className="font-mono text-[11px] text-slate-200 mt-0.5 block break-all">
                  {zipAnalysis.seoRelevantFiles.slice(0, 6).join(', ') || 'None'}
                </span>
              </div>
            </div>

            {/* Security Protections Verified */}
            <div className="text-[11px] text-slate-400 font-mono border-t border-b border-slate-800/80 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {zipAnalysis.securityNotes.map((note, idx) => (
                <span key={idx}>✓ {note}</span>
              ))}
            </div>

            {/* File-by-File Review */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    File-by-File Proposed SEO Changes ({zipChanges.filter((c) => c.approved).length}/{zipChanges.length} Approved)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Review each file, line/area, current code, proposed code, and reason. Only explicitly approved changes are written to the Corrected ZIP.
                  </p>
                </div>

                {zipChanges.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadCorrectedZip}
                    disabled={isBuildingZip || zipChanges.filter((c) => c.approved).length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {isBuildingZip
                        ? 'Packaging Corrected ZIP...'
                        : `Download Corrected ZIP (${zipChanges.filter((c) => c.approved).length} Fixes)`}
                    </span>
                  </button>
                )}
              </div>

              {zipChanges.length === 0 ? (
                <div className="py-6 text-xs text-slate-300">
                  No missing deterministic metadata tags were detected across the inspectable files in this archive.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {zipChanges.map((change) => (
                    <div key={change.id} className="py-4 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={change.approved}
                            onChange={() => toggleZipChangeApproval(change.id)}
                            className="w-4 h-4 accent-emerald-400 rounded cursor-pointer"
                          />
                          <span className="font-mono font-semibold text-slate-100">{change.filePath}</span>
                          <span className="text-slate-600" aria-hidden="true">·</span>
                          <span className="text-slate-400">{change.areaOrLine}</span>
                          <span className="text-slate-600" aria-hidden="true">·</span>
                          <span
                            className={
                              change.safety === 'SAFE AUTO-FIX' ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'
                            }
                          >
                            {change.safety}
                          </span>
                        </label>
                        <span className="text-slate-400">
                          {change.approved ? 'Approved for Corrected ZIP' : 'Skipped'}
                        </span>
                      </div>

                      <p className="text-slate-300">Reason: {change.reason}</p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-[11px]">
                        <div className="bg-slate-950 border border-slate-800/90 rounded p-3 overflow-x-auto">
                          <div className="text-rose-400 mb-1 font-sans font-medium">Current Code</div>
                          <pre className="text-slate-300 whitespace-pre-wrap">{change.currentCode}</pre>
                        </div>
                        <div className="bg-slate-950 border border-slate-800/90 rounded p-3 overflow-x-auto">
                          <div className="text-emerald-400 mb-1 font-sans font-medium">Proposed Code</div>
                          <pre className="text-emerald-200 whitespace-pre-wrap">{change.proposedCode}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ReAuditComparisonSection: React.FC<{
  currentAudit: WebsiteAuditResult;
  previousAudit: WebsiteAuditResult | null;
  onTriggerReAudit: (targetUrl: string) => void;
  isAuditing: boolean;
}> = ({ currentAudit, previousAudit, onTriggerReAudit, isAuditing }) => {
  const [verifyUrl, setVerifyUrl] = useState(currentAudit.finalUrl);

  const prevTitles = new Set(previousAudit ? previousAudit.issues.map((i) => i.title) : []);
  const currTitles = new Set(currentAudit.issues.map((i) => i.title));

  const issuesFixed = previousAudit
    ? previousAudit.issues.filter((i) => !currTitles.has(i.title))
    : [];
  const issuesRemaining = previousAudit
    ? currentAudit.issues.filter((i) => prevTitles.has(i.title))
    : currentAudit.issues;
  const newIssues = previousAudit
    ? currentAudit.issues.filter((i) => !prevTitles.has(i.title))
    : [];

  const scoreDelta = previousAudit ? currentAudit.scores.overall - previousAudit.scores.overall : 0;

  return (
    <div className="space-y-6">
      <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-4">
        <div className="pb-4 border-b border-slate-800/80">
          <h2 className="text-base font-semibold text-slate-100">
            Re-Audit & Before/After Verification Engine
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            After deploying fixes to your live or staging website, run a verification audit to compare diagnostic score improvements and issue resolution. Never claims unverified Google ranking changes.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (verifyUrl.trim()) onTriggerReAudit(verifyUrl.trim());
          }}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
        >
          <input
            type="text"
            value={verifyUrl}
            onChange={(e) => setVerifyUrl(e.target.value)}
            placeholder="https://example.com"
            aria-label="Website URL to verify"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3.5 py-2.5 text-sm text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={isAuditing}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>{isAuditing ? 'Verifying Website...' : 'Re-Run Verification Audit'}</span>
          </button>
        </form>
      </div>

      {!previousAudit ? (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-6 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-slate-100 text-sm">Baseline Audit Recorded ({currentAudit.scores.overall}/100)</div>
          <p className="text-slate-400">
            Click &ldquo;Re-Run Verification Audit&rdquo; above after deploying changes (or test against a staging URL) to see a side-by-side Before vs. After comparison of fixed issues, remaining issues, and diagnostic score delta.
          </p>
        </div>
      ) : (
        <div className="bg-[#111827] border border-slate-800/90 rounded-lg p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Before vs. After Verification Summary</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Baseline ({new Date(previousAudit.auditDate).toLocaleTimeString()}) vs. Latest Verification ({new Date(currentAudit.auditDate).toLocaleTimeString()})
              </p>
            </div>
            <div className="font-mono text-xs">
              <span className="text-slate-400">Diagnostic Score Change: </span>
              <span
                className={
                  scoreDelta > 0
                    ? 'text-emerald-400 font-semibold'
                    : scoreDelta < 0
                    ? 'text-rose-400 font-semibold'
                    : 'text-slate-200 font-semibold'
                }
              >
                {previousAudit.scores.overall} → {currentAudit.scores.overall} ({scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div>
              <span className="text-slate-400 font-sans block">Overall Diagnostic</span>
              <span className="text-base font-semibold text-slate-100 tabular-nums">
                {previousAudit.scores.overall} → {currentAudit.scores.overall}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-sans block">Issues Fixed</span>
              <span className="text-base font-semibold text-emerald-400 tabular-nums">
                {issuesFixed.length}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-sans block">Issues Remaining</span>
              <span className="text-base font-semibold text-amber-400 tabular-nums">
                {issuesRemaining.length}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-sans block">New Issues</span>
              <span className="text-base font-semibold text-rose-400 tabular-nums">
                {newIssues.length}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-800/80 text-xs">
            <div>
              <div className="font-semibold text-emerald-400 mb-2">Resolved Issues ({issuesFixed.length})</div>
              {issuesFixed.length === 0 ? (
                <p className="text-slate-500">No baseline issues resolved between runs yet.</p>
              ) : (
                <ul className="space-y-1.5 text-slate-300">
                  {issuesFixed.map((i) => (
                    <li key={i.id}>✓ {i.title}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="font-semibold text-amber-400 mb-2">Remaining Issues ({issuesRemaining.length})</div>
              {issuesRemaining.length === 0 ? (
                <p className="text-emerald-400">All baseline issues resolved!</p>
              ) : (
                <ul className="space-y-1.5 text-slate-300">
                  {issuesRemaining.map((i) => (
                    <li key={i.id}>• [{i.severity}] {i.title}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <div className="font-semibold text-rose-400 mb-2">Newly Detected Issues ({newIssues.length})</div>
              {newIssues.length === 0 ? (
                <p className="text-slate-500">Zero regressions introduced.</p>
              ) : (
                <ul className="space-y-1.5 text-slate-300">
                  {newIssues.map((i) => (
                    <li key={i.id}>• [{i.severity}] {i.title}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdvancedSettingsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [customUrl, setCustomUrl] = useState(getApiBaseUrl());
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(customUrl);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="adv-settings-title"
    >
      <div className="bg-[#111827] border border-slate-800 rounded-lg max-w-md w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 id="adv-settings-title" className="text-sm font-semibold text-slate-100">
            Advanced API Endpoint Configuration
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <p className="text-slate-400 leading-relaxed">
            By default, ZyvenSEO AI uses the built-in server-side API layer (<code className="text-slate-200">/api/*</code>). Only set a custom backend origin if you are routing requests through a dedicated external worker during custom deployment.
          </p>

          <div>
            <label htmlFor="custom-api-base" className="block text-slate-300 font-medium mb-1.5">
              Custom API Base Origin (Leave empty for default built-in server)
            </label>
            <input
              id="custom-api-base"
              type="text"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="e.g. https://api.yourdomain.com (leave blank for default)"
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setCustomUrl('');
                setApiBaseUrl('');
              }}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              Reset Default
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded cursor-pointer"
            >
              {saved && <Check className="w-3.5 h-3.5" />}
              <span>{saved ? 'Saved' : 'Save Configuration'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
