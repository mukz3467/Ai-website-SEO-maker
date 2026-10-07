import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  RefreshCw,
  X,
  CheckCircle2,
  AlertTriangle,
  Server,
  Key,
  Globe,
  FileCode,
  Terminal,
} from 'lucide-react';
import { fetchSecurityAuditReport } from '../services/api';

export const SecurityStatusModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<{
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
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'checklist' | 'tests'>('checklist');

  const loadReport = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSecurityAuditReport();
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load security status report.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && !report) {
      loadReport();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const CHECKLIST_ITEMS = [
    {
      category: 'SSRF & Network Defense',
      name: 'Server-Side Request Forgery (SSRF) Guard',
      status: 'SECURE' as const,
      detail:
        'Enforces strict protocol whitelist (http/https only), rejects credentials in URLs, blocks private IPv4 (RFC1918), link-local, cloud metadata (169.254.169.254, metadata.google.internal), IPv6 loopback, and IPv4-mapped IPv6.',
    },
    {
      category: 'SSRF & Network Defense',
      name: 'DNS Rebinding Connect-Level Protection',
      status: 'SECURE' as const,
      detail:
        'Custom Undici connect-time lookup agent validates every destination IP address during socket handshake, eliminating TOCTOU DNS rebinding bypasses.',
    },
    {
      category: 'Resource Protection',
      name: 'Fetch Stream & Buffer Limits',
      status: 'SECURE' as const,
      detail:
        'Hard 2 MB response stream cap with stream reader cancellation, 12s connection timeout, max 5 redirect hops with destination re-validation, max 100 response headers.',
    },
    {
      category: 'Access & Abuse Control',
      name: 'Multi-Tier Rate Limiting & Concurrency',
      status: 'SECURE' as const,
      detail:
        'Per-IP token buckets for /audit (15/5m), /ai (8/5m), /gsc (30/5m), and /fix (20/5m). Max 3 concurrent audits per IP. Returns HTTP 429 with Retry-After header.',
    },
    {
      category: 'Access & Abuse Control',
      name: 'Hardened CORS & CSRF Defense',
      status: 'SECURE' as const,
      detail:
        'Never reflects arbitrary origins. Explicit domain whitelist with credentials protection. Mutation requests (POST/PUT/DELETE) validate Origin and Referer headers.',
    },
    {
      category: 'OAuth Security',
      name: 'Google Search Console OAuth 2.0 Hardening',
      status: 'SECURE' as const,
      detail:
        'Server-side confidential client handling. Read-only scope (webmasters.readonly). Cryptographic state nonce validation with 15-minute TTL. HttpOnly session cookies. Disconnect clears authorization immediately.',
    },
    {
      category: 'AI Security',
      name: 'Gemini API & Prompt Injection Containment',
      status: 'SECURE' as const,
      detail:
        'GEMINI_API_KEY kept strictly server-side. Audited website content encapsulated inside <untrusted_website_evidence> delimiters. Explicit system instructions mandate treating website content as passive data. 25-second timeout with offline deterministic fallback.',
    },
    {
      category: 'Client & File Safety',
      name: 'Website Source / ZIP Extraction Security',
      status: 'SECURE' as const,
      detail:
        'Client-side in-memory extraction with JSZip. 50 MB archive cap, 120 MB uncompressed text cap (zip bomb guard), max 3,500 entries, path traversal (../, absolute, encoded) rejection, executable binary filter (.exe, .sh, etc.). Original files are never modified.',
    },
    {
      category: 'Browser Security',
      name: 'XSS Defense & Security Headers',
      status: 'SECURE' as const,
      detail:
        'X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy, safe CSP allowing Google OAuth and fonts. All website strings rendered through safe React JSX bindings without raw innerHTML evaluation.',
    },
    {
      category: 'Observability & Privacy',
      name: 'Structured Logging & Error Sanitization',
      status: 'SECURE' as const,
      detail:
        'Request IDs generated per request. IP addresses masked for privacy. Error responses never leak stack traces, database strings, or environment variables. No secrets or tokens are ever logged.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-modal-title"
    >
      <div className="bg-[#111827] border border-slate-800 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="security-modal-title" className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Production Security & Threat Model Status</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
                  Hardened
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Live verification of SSRF, DNS rebinding, rate limiting, OAuth, and prompt injection controls.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch & Actions */}
        <div className="px-5 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('checklist')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                activeTab === 'checklist'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Security Architecture Controls
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('tests')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                activeTab === 'tests'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              30-Vector Test Suite Results {report && `(${report.passedTests}/${report.totalTests})`}
            </button>
          </div>

          <button
            type="button"
            onClick={loadReport}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-emerald-400 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Running Tests...' : 'Re-run Tests'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 rounded text-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CHECKLIST_ITEMS.map((item) => (
                  <div
                    key={item.name}
                    className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                        {item.category}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {item.status}
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 text-xs">{item.name}</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="space-y-3">
              {isLoading && !report ? (
                <div className="py-12 text-center text-slate-400 flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                  <span>Running automated 30-vector security test suite...</span>
                </div>
              ) : report ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">
                        Overall Test Suite Verdict: <span className="text-emerald-400 font-mono">{report.overallStatus}</span>
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Executed {report.totalTests} security test vectors across SSRF, DNS, Rate Limiting, CORS, OAuth, AI, and ZIP surfaces.
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                      <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Passed: {report.passedTests}
                      </span>
                      {report.failedTests > 0 && (
                        <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Failed: {report.failedTests}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {report.results.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-500 text-[10px]">#{r.id}</span>
                            <span className="font-semibold text-slate-200">{r.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              {r.category}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            Vector: <code className="text-slate-300">{r.vector}</code>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Evidence: {r.evidence}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1.5 self-start sm:self-center">
                          {r.actualStatus === 'PASSED' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                              <CheckCircle2 className="w-3 h-3" /> PASSED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded font-mono">
                              <ShieldAlert className="w-3 h-3" /> FAILED
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zero Remote Source Code Uploads · Private Token Isolation</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
