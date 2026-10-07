import * as cheerio from 'cheerio';
import { safeFetchUrl } from './ssrf';
import type {
  ContentIntelligenceData,
  CrawledPageSummary,
  DetectedTechnology,
  ExternalLinkItem,
  ImageAltAnalysis,
  InternalLinkAnalysis,
  ObservedLinkItem,
  OnPageItem,
  OpenGraphAnalysis,
  PerformanceSignalAudit,
  PrimaryGoal,
  SEOIssue,
  SeverityLevel,
  StructuredDataAudit,
  StructuredDataItem,
  TargetMarket,
  TechnicalCheckItem,
  TwitterCardAnalysis,
  WebsiteAuditResult,
} from '../types/seo';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'you', 'are',
  'not', 'have', 'has', 'was', 'were', 'will', 'can', 'our', 'all', 'more',
  'about', 'into', 'than', 'its', 'they', 'their', 'what', 'when', 'where',
  'which', 'who', 'whom', 'how', 'why', 'but', 'use', 'using', 'used', 'also',
  'new', 'one', 'two', 'out', 'get', 'set', 'may', 'any', 'most', 'some',
  'such', 'only', 'other', 'over', 'under', 'between', 'after', 'before',
  'through', 'during', 'without', 'within', 'along', 'following', 'across',
]);

const GENERIC_ANCHORS = new Set([
  'click here',
  'read more',
  'learn more',
  'more',
  'here',
  'link',
  'website',
  'details',
  'view',
  'continue',
  'go',
  'this link',
  'page',
]);

function extractSchemaTypes(obj: any): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const types: string[] = [];
  if (typeof obj['@type'] === 'string') {
    types.push(obj['@type']);
  } else if (Array.isArray(obj['@type'])) {
    for (const t of obj['@type']) {
      if (typeof t === 'string') types.push(t);
    }
  }
  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      types.push(...extractSchemaTypes(item));
    }
  }
  return Array.from(new Set(types));
}

export async function runWebsiteAudit(params: {
  url: string;
  targetMarket: TargetMarket;
  customMarket?: string;
  primaryGoal: PrimaryGoal;
  crawlMode?: 'single' | 'multi';
}): Promise<WebsiteAuditResult> {
  const { url, targetMarket, customMarket, primaryGoal, crawlMode = 'single' } = params;

  // 1. Fetch main page HTML with SSRF and redirect validation
  const mainFetch = await safeFetchUrl(url, {
    requireHtmlContentType: true,
    allowHttpErrors: false,
  });

  const finalUrlObj = new URL(mainFetch.finalUrl);
  const origin = finalUrlObj.origin;
  const $ = cheerio.load(mainFetch.html);

  // 2. Fetch robots.txt & sitemap.xml in parallel
  const robotsUrl = `${origin}/robots.txt`;
  const defaultSitemapUrl = `${origin}/sitemap.xml`;

  const [robotsRes, sitemapRes] = await Promise.allSettled([
    safeFetchUrl(robotsUrl, { timeoutMs: 5000, maxBytes: 256 * 1024, maxRedirects: 3, allowHttpErrors: true }),
    safeFetchUrl(defaultSitemapUrl, { timeoutMs: 5000, maxBytes: 512 * 1024, maxRedirects: 3, allowHttpErrors: true }),
  ]);

  // Parse robots.txt
  let robotsAvailable = false;
  let robotsStatus: 'Exists' | 'Missing' | 'Unavailable' | 'Malformed' = 'Missing';
  let robotsStatusCode: number | null = null;
  let robotsPreview = '';
  let blocksCurrentPath = false;
  const sitemapReferences: string[] = [];
  const relevantRules: string[] = [];

  if (robotsRes.status === 'fulfilled') {
    robotsStatusCode = robotsRes.value.statusCode;
    if (robotsStatusCode === 200) {
      const txt = robotsRes.value.html;
      const isHtmlResponse = txt.trim().toLowerCase().startsWith('<!doctype html') || txt.trim().toLowerCase().startsWith('<html');
      if (!isHtmlResponse) {
        robotsAvailable = true;
        robotsStatus = 'Exists';
        robotsPreview = txt.slice(0, 750);
        const lines = txt.split(/\r?\n/);
        let appliesToAll = false;
        const currentPath = finalUrlObj.pathname || '/';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith('#')) continue;

          if (/^sitemap:/i.test(line)) {
            const sm = line.replace(/^sitemap:\s*/i, '').trim();
            if (sm && !sitemapReferences.includes(sm)) sitemapReferences.push(sm);
          }

          if (/^user-agent:\s*\*/i.test(line)) {
            appliesToAll = true;
            relevantRules.push(line);
          } else if (/^user-agent:/i.test(line)) {
            appliesToAll = false;
          }

          if (appliesToAll) {
            if (/^disallow:/i.test(line)) {
              const rulePath = line.replace(/^disallow:\s*/i, '').trim();
              if (rulePath) relevantRules.push(line);
              if (rulePath === '/' || (rulePath && currentPath.startsWith(rulePath))) {
                blocksCurrentPath = true;
              }
            } else if (/^allow:/i.test(line)) {
              const rulePath = line.replace(/^allow:\s*/i, '').trim();
              if (rulePath) relevantRules.push(line);
              if (rulePath && currentPath.startsWith(rulePath)) {
                blocksCurrentPath = false; // Allow overrides Disallow if more specific
              }
            }
          }
        }
      } else {
        robotsStatus = 'Malformed';
      }
    } else if (robotsStatusCode === 404) {
      robotsStatus = 'Missing';
    } else {
      robotsStatus = 'Unavailable';
    }
  } else {
    robotsStatus = 'Unavailable';
  }

  // Parse sitemap.xml
  let sitemapAvailable = false;
  let sitemapStatus: 'Found' | 'Missing' | 'Blocked' | 'Unavailable' = 'Missing';
  let sitemapFormat: 'XML sitemap' | 'Sitemap index' | 'HTML' | 'Unavailable' = 'Unavailable';
  let sitemapStatusCode: number | null = null;
  let sitemapUrlCount: number | null = null;
  const sitemapCheckedUrl = sitemapReferences[0] || defaultSitemapUrl;
  let detectedSitemapUrl: string | undefined = undefined;

  if (sitemapRes.status === 'fulfilled') {
    sitemapStatusCode = sitemapRes.value.statusCode;
    if (sitemapStatusCode === 200) {
      const xml = sitemapRes.value.html;
      if (xml.includes('<sitemapindex')) {
        sitemapAvailable = true;
        sitemapStatus = 'Found';
        sitemapFormat = 'Sitemap index';
        detectedSitemapUrl = defaultSitemapUrl;
        const locMatches = xml.match(/<loc>/gi);
        sitemapUrlCount = locMatches ? locMatches.length : 0;
      } else if (xml.includes('<urlset') || xml.includes('<loc>')) {
        sitemapAvailable = true;
        sitemapStatus = 'Found';
        sitemapFormat = 'XML sitemap';
        detectedSitemapUrl = defaultSitemapUrl;
        const locMatches = xml.match(/<loc>/gi);
        sitemapUrlCount = locMatches ? locMatches.length : 0;
      } else if (xml.toLowerCase().includes('<!doctype html') || xml.toLowerCase().includes('<html')) {
        sitemapAvailable = true;
        sitemapStatus = 'Found';
        sitemapFormat = 'HTML';
      }
    } else if (sitemapStatusCode === 403 || sitemapStatusCode === 429) {
      sitemapStatus = 'Blocked';
    } else if (sitemapStatusCode === 404) {
      sitemapStatus = 'Missing';
    } else {
      sitemapStatus = 'Unavailable';
    }
  } else {
    sitemapStatus = 'Unavailable';
  }

  if (!sitemapAvailable && sitemapReferences.length > 0) {
    sitemapAvailable = true;
    sitemapStatus = 'Found';
    sitemapFormat = 'XML sitemap';
    detectedSitemapUrl = sitemapReferences[0];
  }

  // 3. Extract Metadata
  const rawTitle = $('head > title').first().text().trim() || $('title').first().text().trim();
  const title = rawTitle.replace(/\s+/g, ' ');
  const titleLen = title.length;

  let titleStatus: 'Good' | 'Needs Improvement' | 'Missing' = 'Good';
  if (!title) {
    titleStatus = 'Missing';
  } else if (titleLen < 30 || titleLen > 60) {
    titleStatus = 'Needs Improvement';
  }

  const rawDescription =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[name="Description"]').attr('content')?.trim() ||
    '';
  const metaDescription = rawDescription.replace(/\s+/g, ' ');
  const descLen = metaDescription.length;

  let metaDescriptionStatus: 'Good' | 'Needs Improvement' | 'Missing' = 'Good';
  if (!metaDescription) {
    metaDescriptionStatus = 'Missing';
  } else if (descLen < 70 || descLen > 160) {
    metaDescriptionStatus = 'Needs Improvement';
  }

  const canonicalTags = $('link[rel="canonical"]');
  const multipleCanonical = canonicalTags.length > 1;
  const canonicalRaw = canonicalTags.first().attr('href')?.trim() || '';
  let canonical = canonicalRaw;
  let canonicalStatus: 'Valid Self-Referencing' | 'Cross-URL / Mismatched' | 'Missing' | 'Malformed' = 'Missing';

  if (!canonicalRaw) {
    canonicalStatus = 'Missing';
  } else {
    try {
      const parsedCanonical = new URL(canonicalRaw, mainFetch.finalUrl);
      canonical = parsedCanonical.toString();
      const normCanonical = canonical.replace(/\/$/, '').toLowerCase();
      const normFinal = mainFetch.finalUrl.replace(/\/$/, '').toLowerCase();

      if (multipleCanonical) {
        canonicalStatus = 'Cross-URL / Mismatched';
      } else if (normCanonical === normFinal) {
        canonicalStatus = 'Valid Self-Referencing';
      } else {
        canonicalStatus = 'Cross-URL / Mismatched';
      }
    } catch {
      canonicalStatus = 'Malformed';
    }
  }

  const robotsMeta =
    $('meta[name="robots"]').attr('content')?.trim() ||
    $('meta[name="googlebot"]').attr('content')?.trim() ||
    '';
  const xRobotsTag = mainFetch.headers['x-robots-tag'] || '';

  const combinedRobotsLower = `${robotsMeta} ${xRobotsTag}`.toLowerCase();
  const robotsDirectives: string[] = [];
  if (combinedRobotsLower.includes('noindex')) robotsDirectives.push('noindex');
  if (combinedRobotsLower.includes('nofollow')) robotsDirectives.push('nofollow');
  if (combinedRobotsLower.includes('noarchive')) robotsDirectives.push('noarchive');
  if (combinedRobotsLower.includes('nosnippet')) robotsDirectives.push('nosnippet');
  if (combinedRobotsLower.includes('none')) robotsDirectives.push('none');

  const hasNoindex = robotsDirectives.includes('noindex') || robotsDirectives.includes('none');
  const hasNofollow = robotsDirectives.includes('nofollow') || robotsDirectives.includes('none');

  let indexabilitySignal: 'Allowed to crawl' | 'Blocked by robots.txt' | 'Noindex detected' | 'Not measurable' = 'Allowed to crawl';
  if (hasNoindex) {
    indexabilitySignal = 'Noindex detected';
  } else if (blocksCurrentPath) {
    indexabilitySignal = 'Blocked by robots.txt';
  }

  // Combined indexability verdict: Indexable | Not Indexable | Conditionally Indexable
  let indexabilityVerdict: 'Indexable' | 'Not Indexable' | 'Conditionally Indexable' = 'Indexable';
  let indexabilityReason = 'HTTP 200 OK received, crawler allowed by robots directives, self-referencing canonical.';

  if (mainFetch.statusCode >= 400 || hasNoindex || blocksCurrentPath) {
    indexabilityVerdict = 'Not Indexable';
    indexabilityReason = mainFetch.statusCode >= 400
      ? `Server returned HTTP error status ${mainFetch.statusCode}.`
      : hasNoindex
      ? 'Search engine indexing explicitly forbidden by noindex directive.'
      : 'URL path is disallowed for web crawlers in robots.txt.';
  } else if (mainFetch.statusCode >= 300 && mainFetch.statusCode < 400) {
    indexabilityVerdict = 'Conditionally Indexable';
    indexabilityReason = `URL returns redirect status ${mainFetch.statusCode} pointing to ${mainFetch.finalUrl}.`;
  } else if (canonicalStatus === 'Cross-URL / Mismatched') {
    indexabilityVerdict = 'Conditionally Indexable';
    indexabilityReason = multipleCanonical
      ? 'Multiple canonical tags detected in DOM, which causes indexing ambiguity.'
      : `Canonical tag specifies different target URL (${canonical}).`;
  } else if (hasNofollow) {
    indexabilityVerdict = 'Conditionally Indexable';
    indexabilityReason = 'Document declares nofollow directive, instructing search engines not to follow outbound links.';
  }

  const viewport = $('meta[name="viewport"]').attr('content')?.trim() || '';
  const lang = $('html').attr('lang')?.trim() || '';
  const charset =
    $('meta[charset]').attr('charset')?.trim() ||
    $('meta[http-equiv="Content-Type"]').attr('content')?.trim() ||
    (mainFetch.headers['content-type']?.includes('charset=')
      ? mainFetch.headers['content-type'].split('charset=')[1].trim()
      : 'UTF-8');

  const favicon =
    $('link[rel="icon"]').attr('href') ||
    $('link[rel="shortcut icon"]').attr('href') ||
    $('link[rel="apple-touch-icon"]').attr('href') ||
    '';

  // Open Graph analysis
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property')?.trim();
    const content = $(el).attr('content')?.trim();
    if (prop && content) ogTags[prop] = content;
  });

  const requiredOg = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
  const missingOg = requiredOg.filter((k) => !ogTags[k]);
  const openGraph: OpenGraphAnalysis = {
    tags: ogTags,
    presentCount: Object.keys(ogTags).length,
    missingRequired: missingOg,
    hasCoreTags: Boolean(ogTags['og:title'] && ogTags['og:description']),
  };

  // Twitter Card analysis
  const twitterTags: Record<string, string> = {};
  $('meta[name^="twitter:"], meta[property^="twitter:"]').each((_, el) => {
    const name = ($(el).attr('name') || $(el).attr('property'))?.trim();
    const content = $(el).attr('content')?.trim();
    if (name && content) twitterTags[name] = content;
  });

  const missingTwitter = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].filter(
    (k) => !twitterTags[k]
  );
  const twitterCard: TwitterCardAnalysis = {
    tags: twitterTags,
    presentCount: Object.keys(twitterTags).length,
    cardType: twitterTags['twitter:card'],
    missingCore: missingTwitter,
  };

  const hreflangTags: { lang: string; href: string }[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const hLang = $(el).attr('hreflang')?.trim();
    const href = $(el).attr('href')?.trim();
    if (hLang && href) hreflangTags.push({ lang: hLang, href });
  });

  // 4. Headings Analysis
  const h1: string[] = [];
  const h2: string[] = [];
  const h3: string[] = [];
  let emptyHeadingsCount = 0;
  const allHeadingsSeen = new Map<string, number>();
  const duplicateHeadings: string[] = [];
  const hierarchyIssues: string[] = [];

  let prevLevel = 0;
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const level = Number(tag.replace('h', ''));
    const text = $(el).text().replace(/\s+/g, ' ').trim();

    if (!text) {
      emptyHeadingsCount++;
      return;
    }

    if (level === 1) h1.push(text);
    if (level === 2) h2.push(text);
    if (level === 3) h3.push(text);

    const norm = `${tag}:${text.toLowerCase()}`;
    const count = (allHeadingsSeen.get(norm) || 0) + 1;
    allHeadingsSeen.set(norm, count);
    if (count === 2) duplicateHeadings.push(`<${tag}> "${text.slice(0, 65)}"`);

    if (prevLevel > 0 && level > prevLevel + 1) {
      hierarchyIssues.push(`Skipped heading level from <h${prevLevel}> to <h${level}> ("${text.slice(0, 45)}")`);
    }
    prevLevel = level;
  });

  const h4ToH6Count = $('h4, h5, h6').length;

  // 5. Images Analysis
  let totalImages = 0;
  let imagesWithAlt = 0;
  let imagesWithoutAlt = 0;
  let imagesWithoutLazyLoad = 0;
  let imagesWithoutDimensions = 0;
  const sampleImages: ImageAltAnalysis['sampleImages'] = [];

  $('img').each((idx, el) => {
    totalImages++;
    const rawAlt = $(el).attr('alt');
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    const loading = $(el).attr('loading');
    const width = $(el).attr('width');
    const height = $(el).attr('height');

    const hasAlt = rawAlt !== undefined && rawAlt !== null;
    const isExplicitlyEmpty = rawAlt === '';

    if (hasAlt && !isExplicitlyEmpty) {
      imagesWithAlt++;
    } else if (isExplicitlyEmpty) {
      // Empty alt="" is valid for decorative images per WCAG!
      imagesWithEmptyAlt++;
      imagesWithAlt++;
    } else {
      imagesWithoutAlt++;
    }

    if (loading !== 'lazy' && idx > 1) {
      imagesWithoutLazyLoad++;
    }

    if (!width || !height) {
      imagesWithoutDimensions++;
    }

    if (sampleImages.length < 15) {
      sampleImages.push({
        src: src.slice(0, 100) || '(inline or data URI)',
        alt: rawAlt ?? null,
        hasAlt,
        isDecorativeCandidate: isExplicitlyEmpty || (!hasAlt && (src.includes('icon') || src.includes('divider') || src.includes('bullet'))),
      });
    }
  });

  let imagesWithEmptyAlt = 0;
  // Count explicit empty alt tags
  $('img').each((_, el) => {
    if ($(el).attr('alt') === '') imagesWithEmptyAlt++;
  });

  const coveragePercent = totalImages > 0 ? Math.round((imagesWithAlt / totalImages) * 100) : 100;
  const images: ImageAltAnalysis = {
    totalImages,
    imagesWithAlt,
    imagesWithoutAlt,
    imagesWithEmptyAlt,
    coveragePercent,
    imagesWithoutLazyLoad,
    imagesWithoutDimensions,
    decorativeGuidance:
      'Per WCAG and Google Image guidelines: Informative images must have descriptive alt text. Purely decorative images (icons, background patterns, spacers) should have empty alt="" so screen readers ignore them without penalty. Never stuff keywords into decorative images.',
    sampleImages,
  };

  // 6. Links Classification (Internal vs External)
  const maxLinksLimit = Number(process.env.MAX_LINKS_PER_PAGE || 120);
  const internalLinkMap = new Map<string, ObservedLinkItem>();
  const externalLinkMap = new Map<string, ExternalLinkItem>();
  let totalInternalLinks = 0;
  let totalExternalLinks = 0;
  let emptyAnchorCount = 0;
  let genericAnchorCount = 0;
  let emptyHrefCount = 0;
  let fragmentOnlyCount = 0;
  let nofollowInternalCount = 0;

  $('a').each((idx, el) => {
    const rawHrefAttr = $(el).attr('href');
    if (rawHrefAttr === undefined || rawHrefAttr.trim() === '') {
      emptyHrefCount++;
      return;
    }
    const rawHref = rawHrefAttr.trim();
    if (rawHref === '#' || rawHref.startsWith('#')) {
      fragmentOnlyCount++;
      return;
    }
    if (idx >= maxLinksLimit * 2) return;
    const anchorText =
      $(el).text().replace(/\s+/g, ' ').trim() ||
      $(el).attr('aria-label')?.trim() ||
      $(el).find('img').attr('alt')?.trim() ||
      '';
    const rel = $(el).attr('rel')?.trim() || '';

    if (rawHref.startsWith('javascript:')) return;
    if (rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return;

    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(rawHref, mainFetch.finalUrl);
    } catch {
      return;
    }

    const isInternal = resolvedUrl.hostname === finalUrlObj.hostname;
    resolvedUrl.hash = '';
    const cleanUrl = resolvedUrl.toString();

    if (!anchorText) {
      emptyAnchorCount++;
    } else if (GENERIC_ANCHORS.has(anchorText.toLowerCase())) {
      genericAnchorCount++;
    }

    if (isInternal) {
      totalInternalLinks++;
      if (rel.toLowerCase().includes('nofollow')) nofollowInternalCount++;

      const existing = internalLinkMap.get(cleanUrl);
      if (existing) {
        existing.occurrences += 1;
        if ((!existing.anchorText || existing.anchorText === '(Empty anchor)') && anchorText) {
          existing.anchorText = anchorText;
        }
      } else if (internalLinkMap.size < maxLinksLimit) {
        internalLinkMap.set(cleanUrl, {
          href: cleanUrl,
          anchorText: anchorText || '(Empty anchor)',
          isInternal: true,
          rel,
          occurrences: 1,
          statusNote: 'Observed in DOM',
        });
      }
    } else {
      totalExternalLinks++;
      const domain = resolvedUrl.hostname;
      const key = `${domain}:${cleanUrl}`;
      const existingExt = externalLinkMap.get(key);
      if (existingExt) {
        existingExt.occurrences += 1;
      } else if (externalLinkMap.size < maxLinksLimit) {
        externalLinkMap.set(key, {
          href: cleanUrl,
          domain,
          anchorText: anchorText || '(Empty anchor)',
          rel,
          occurrences: 1,
          isNofollow: rel.toLowerCase().includes('nofollow'),
          isSponsored: rel.toLowerCase().includes('sponsored'),
          isUgc: rel.toLowerCase().includes('ugc'),
        });
      }
    }
  });

  const observedInternal = Array.from(internalLinkMap.values());
  const observedExternal = Array.from(externalLinkMap.values());
  const sortedInternalDesc = [...observedInternal].sort((a, b) => b.occurrences - a.occurrences);
  const sortedInternalAsc = [...observedInternal].sort((a, b) => a.occurrences - b.occurrences);

  const uniqueExternalDomains = new Set(observedExternal.map((l) => l.domain)).size;

  // 7. Structured Data (JSON-LD)
  const structuredItems: StructuredDataItem[] = [];
  const allSchemaTypes = new Set<string>();
  let validJsonLd = 0;
  let invalidJsonLd = 0;

  $('script[type="application/ld+json"]').each((idx, el) => {
    const raw = $(el).html()?.trim() || '';
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const types = extractSchemaTypes(parsed);
      types.forEach((t) => allSchemaTypes.add(t));
      const issues: string[] = [];
      if (types.length === 0) {
        issues.push('Missing @type declaration in JSON-LD block.');
      }
      if (!raw.includes('schema.org')) {
        issues.push('Missing @context "https://schema.org" declaration.');
      }
      validJsonLd++;
      structuredItems.push({
        index: idx + 1,
        types: types.length > 0 ? types : ['Unspecified'],
        valid: issues.length === 0,
        rawPreview: raw.slice(0, 500),
        issues,
      });
    } catch (e: any) {
      invalidJsonLd++;
      structuredItems.push({
        index: idx + 1,
        types: ['Invalid JSON-LD'],
        valid: false,
        rawPreview: raw.slice(0, 500),
        issues: [`JSON Syntax error: ${e.message || 'Malformed JSON payload'}`],
      });
    }
  });

  // 8. Content Analysis & Visible Text Extraction
  const $clone = cheerio.load(mainFetch.html);
  $clone('script, style, noscript, svg, nav, footer, iframe, head').remove();
  const rawBodyText = $clone('body').text().replace(/\s+/g, ' ').trim();
  const words = rawBodyText
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const wordCount = words.length;
  const characterCount = rawBodyText.length;
  const sentenceCount = Math.max(1, rawBodyText.split(/[.!?]+/).filter((s) => s.trim().length > 5).length);
  const paragraphCount = $('p').length;
  const textToHtmlRatioPercent = mainFetch.byteLength > 0
    ? Number(((characterCount / mainFetch.byteLength) * 100).toFixed(1))
    : 0;

  let contentDepthAssessment: ContentIntelligenceData['contentDepthAssessment'] = 'Reasonably substantial content';
  if (wordCount < 100) {
    contentDepthAssessment = 'Very thin content';
  } else if (wordCount < 300) {
    contentDepthAssessment = 'Potentially low-content page';
  }

  // Detect likely JavaScript-rendered SPA
  const hasSpaRoot =
    $('#root, #__next, #app, [data-reactroot], #__nuxt').length > 0 ||
    mainFetch.html.includes('<div id="root"></div>') ||
    mainFetch.html.includes('<div id="__next"></div>');
  const hasScriptBundles = $('script[src]').length >= 2;
  const isJavaScriptRenderedLikely = hasSpaRoot && wordCount < 80 && hasScriptBundles;
  const jsRenderNotice = isJavaScriptRenderedLikely
    ? 'Some content may be JavaScript-rendered and was not fully observable from the server-returned HTML. Standard search engine crawlers may need client hydration or dynamic SSR to discover internal links and textual copy.'
    : undefined;

  const freqMap = new Map<string, number>();
  for (const w of words) {
    if (STOP_WORDS.has(w) || /^\d+$/.test(w)) continue;
    freqMap.set(w, (freqMap.get(w) || 0) + 1);
  }

  const topObservedTerms = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term, count]) => ({
      term,
      count,
      densityPercent: wordCount > 0 ? Number(((count / wordCount) * 100).toFixed(2)) : 0,
    }));

  const primaryTopic =
    h1[0] ||
    (title ? title.split(/[|\-–—:]/)[0].trim() : '') ||
    topObservedTerms.slice(0, 3).map((t) => t.term).join(' ') ||
    finalUrlObj.hostname;

  const secondaryTopics = [
    ...h2.slice(0, 4).map((h) => h.slice(0, 60)),
    ...topObservedTerms.slice(0, 5).map((t) => t.term),
  ].filter(Boolean);

  const lowerBody = rawBodyText.toLowerCase();
  let probableSearchIntent: ContentIntelligenceData['probableSearchIntent'] = 'Informational';
  if (
    lowerBody.includes('add to cart') ||
    lowerBody.includes('buy now') ||
    lowerBody.includes('checkout') ||
    lowerBody.includes('pricing')
  ) {
    probableSearchIntent = 'Transactional';
  } else if (
    lowerBody.includes('compare') ||
    lowerBody.includes('best ') ||
    lowerBody.includes('demo') ||
    lowerBody.includes('free trial') ||
    lowerBody.includes('solutions')
  ) {
    probableSearchIntent = 'Commercial';
  } else if (wordCount < 250 && totalInternalLinks > 10) {
    probableSearchIntent = 'Navigational';
  }

  const avgWordsPerSentence = wordCount > 0 ? Math.round(wordCount / sentenceCount) : 0;
  const readabilitySummary =
    wordCount === 0
      ? 'Minimal or JavaScript-rendered text observed in initial HTML response.'
      : `Observed ${wordCount} words across ${sentenceCount} sentences (avg ${avgWordsPerSentence} words/sentence) and ${paragraphCount} paragraphs. Text-to-HTML ratio: ${textToHtmlRatioPercent}%.`;

  // 9. Technology Detection
  const technologies: DetectedTechnology[] = [];
  const rawHtmlLower = mainFetch.html.toLowerCase();
  const poweredBy = (mainFetch.headers['x-powered-by'] || '').toLowerCase();
  const serverHdr = (mainFetch.headers['server'] || '').toLowerCase();

  if (rawHtmlLower.includes('/_next/') || rawHtmlLower.includes('__next_data__') || poweredBy.includes('next.js')) {
    technologies.push({
      name: 'Next.js',
      category: 'Framework',
      confidence: 'High',
      evidence: 'Observed /_next/ asset paths or __NEXT_DATA__ hydration payload in DOM',
    });
  }
  if (rawHtmlLower.includes('data-reactroot') || rawHtmlLower.includes('react') || rawHtmlLower.includes('/react-dom/')) {
    technologies.push({
      name: 'React',
      category: 'Framework',
      confidence: 'Medium',
      evidence: 'Observed React DOM roots or JavaScript bundle identifiers',
    });
  }
  if (rawHtmlLower.includes('/wp-content/') || rawHtmlLower.includes('/wp-includes/') || rawHtmlLower.includes('wordpress')) {
    technologies.push({
      name: 'WordPress',
      category: 'CMS / Commerce',
      confidence: 'High',
      evidence: 'Observed /wp-content/ directories or WordPress generator signatures',
    });
  }
  if (rawHtmlLower.includes('cdn.shopify.com') || rawHtmlLower.includes('shopify.theme')) {
    technologies.push({
      name: 'Shopify',
      category: 'CMS / Commerce',
      confidence: 'High',
      evidence: 'Observed cdn.shopify.com assets or Shopify theme scripts',
    });
  }
  if (rawHtmlLower.includes('webflow.com') || $('html').attr('data-wf-site')) {
    technologies.push({
      name: 'Webflow',
      category: 'CMS / Commerce',
      confidence: 'High',
      evidence: 'Observed data-wf-site attribute or Webflow asset signatures',
    });
  }
  if (rawHtmlLower.includes('wix.com') || rawHtmlLower.includes('wixstatic.com')) {
    technologies.push({
      name: 'Wix',
      category: 'CMS / Commerce',
      confidence: 'High',
      evidence: 'Observed wixstatic.com CDN assets',
    });
  }
  if (rawHtmlLower.includes('astro-') || rawHtmlLower.includes('data-astro-cid')) {
    technologies.push({
      name: 'Astro',
      category: 'Framework',
      confidence: 'High',
      evidence: 'Observed Astro scoped attributes (data-astro-cid)',
    });
  }
  if (rawHtmlLower.includes('data-v-') || rawHtmlLower.includes('__nuxt')) {
    technologies.push({
      name: 'Vue / Nuxt',
      category: 'Framework',
      confidence: 'High',
      evidence: 'Observed Vue scoped data-v- attributes or Nuxt state',
    });
  }
  if (rawHtmlLower.includes('svelte-')) {
    technologies.push({
      name: 'Svelte',
      category: 'Framework',
      confidence: 'Medium',
      evidence: 'Observed svelte-* class conventions',
    });
  }
  if (serverHdr.includes('cloudflare') || mainFetch.headers['cf-ray']) {
    technologies.push({
      name: 'Cloudflare',
      category: 'Hosting / CDN',
      confidence: 'High',
      evidence: 'Observed Cloudflare server or cf-ray HTTP response headers',
    });
  }
  if (mainFetch.headers['x-vercel-id'] || serverHdr.includes('vercel')) {
    technologies.push({
      name: 'Vercel',
      category: 'Hosting / CDN',
      confidence: 'High',
      evidence: 'Observed x-vercel-id or Vercel server headers',
    });
  }
  if (rawHtmlLower.includes('firebaseapp.com') || rawHtmlLower.includes('__/firebase/')) {
    technologies.push({
      name: 'Firebase',
      category: 'Hosting / CDN',
      confidence: 'Medium',
      evidence: 'Observed Firebase SDK hosting scripts',
    });
  }
  if (rawHtmlLower.includes('tailwindcss') || rawHtmlLower.includes('tailwind')) {
    technologies.push({
      name: 'Tailwind CSS',
      category: 'Styling',
      confidence: 'Medium',
      evidence: 'Observed utility class signatures or stylesheet references',
    });
  }

  if (technologies.length === 0) {
    technologies.push({
      name: 'Standard HTML / Custom Server',
      category: 'Rendering',
      confidence: 'High',
      evidence: `Served via ${mainFetch.headers['server'] || 'standard HTTP origin'}`,
    });
  }

  // 10. Performance Signals & Observable Resources
  const totalScripts = $('script').length;
  let renderBlockingScripts = 0;
  $('head script[src]').each((_, el) => {
    const asyncAttr = $(el).attr('async');
    const deferAttr = $(el).attr('defer');
    const typeAttr = $(el).attr('type');
    if (asyncAttr === undefined && deferAttr === undefined && typeAttr !== 'module') {
      renderBlockingScripts++;
    }
  });
  const stylesheetCount = $('link[rel="stylesheet"]').length;

  const perfRecommendations: PerformanceSignalAudit['recommendations'] = [];
  if (renderBlockingScripts > 0) {
    perfRecommendations.push({
      title: 'Defer Render-Blocking JavaScript in <head>',
      severity: renderBlockingScripts > 2 ? 'HIGH' : 'MEDIUM',
      observedEvidence: `Observed ${renderBlockingScripts} synchronous <script src="..."> tag(s) in <head> without async, defer, or type="module".`,
      action: 'Add defer or async attributes to non-critical external scripts in <head> to prevent parsing blockages.',
    });
  }
  if (images.imagesWithoutLazyLoad > 0) {
    perfRecommendations.push({
      title: 'Enable Native Lazy Loading for Below-the-Fold Images',
      severity: 'LOW',
      observedEvidence: `Observed ${images.imagesWithoutLazyLoad} image(s) beyond the hero section without loading="lazy".`,
      action: 'Add loading="lazy" and decoding="async" to non-LCP images while keeping hero images eager.',
    });
  }
  if (images.imagesWithoutDimensions > 0) {
    perfRecommendations.push({
      title: 'Specify Explicit Width & Height on Images',
      severity: 'MEDIUM',
      observedEvidence: `Observed ${images.imagesWithoutDimensions} of ${images.totalImages} <img> element(s) missing width/height attributes.`,
      action: 'Set width and height attributes (or CSS aspect-ratio) to prevent Cumulative Layout Shift (CLS).',
    });
  }
  if (!mainFetch.headers['content-encoding']) {
    perfRecommendations.push({
      title: 'Enable Brotli or Gzip Compression',
      severity: 'MEDIUM',
      observedEvidence: 'No content-encoding compression header was observed on the server response.',
      action: 'Configure Brotli (br) or Gzip compression on your web server or CDN.',
    });
  }
  if (perfRecommendations.length === 0) {
    perfRecommendations.push({
      title: 'Monitor Real-User Core Web Vitals in Search Console',
      severity: 'LOW',
      observedEvidence: `Initial HTML document fetched in ${mainFetch.responseTimeMs}ms (${Math.round(mainFetch.byteLength / 1024)} KB).`,
      action: 'Track real-world 75th-percentile LCP, INP, and CLS field metrics in Google Search Console.',
    });
  }

  const performance: PerformanceSignalAudit = {
    responseTimeMs: mainFetch.responseTimeMs,
    htmlSizeBytes: mainFetch.byteLength,
    contentType: mainFetch.contentType,
    redirectCount: mainFetch.redirectChain.length,
    totalImages: images.totalImages,
    imagesWithoutAlt: images.imagesWithoutAlt,
    imagesWithoutLazyLoad: images.imagesWithoutLazyLoad,
    imagesWithoutDimensions: images.imagesWithoutDimensions,
    renderBlockingScripts,
    totalScripts,
    stylesheetCount,
    compressionHeader: mainFetch.headers['content-encoding'] || 'None observed',
    cacheControlHeader: mainFetch.headers['cache-control'] || 'None observed',
    unmeasuredMetrics: [
      {
        metric: 'Largest Contentful Paint (LCP)',
        reason: 'Not measured — requires Chrome UX Report (CrUX) field data or live browser rendering engine.',
      },
      {
        metric: 'Interaction to Next Paint (INP)',
        reason: 'Not measured — requires live user interaction telemetry in a real browser session.',
      },
      {
        metric: 'Cumulative Layout Shift (CLS)',
        reason: 'Not measured — requires layout stability tracking across the rendered viewport.',
      },
      {
        metric: 'PageSpeed Score',
        reason: 'Not measured — ZyvenSEO never fabricates synthetic Google PageSpeed or Lighthouse score values.',
      },
    ],
    recommendations: perfRecommendations,
  };

  // 11. Crawled Pages Summary (Single or Multi-Page)
  const crawledPages: CrawledPageSummary[] = [
    {
      url: mainFetch.finalUrl,
      statusCode: mainFetch.statusCode,
      title: title || '(Missing)',
      metaDescription: metaDescription || '(Missing)',
      h1: h1[0] || '(Missing)',
      canonical: canonical || '(Missing)',
      wordCount,
      internalLinksCount: totalInternalLinks,
      indexable: !hasNoindex && !blocksCurrentPath,
    },
  ];

  if (crawlMode === 'multi') {
    const candidateUrls = observedInternal
      .map((l) => l.href)
      .filter((u) => u !== mainFetch.finalUrl && !/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|css|js)$/i.test(u))
      .slice(0, 4);

    const subResults = await Promise.allSettled(
      candidateUrls.map((u) => safeFetchUrl(u, { timeoutMs: 6000, maxBytes: 1024 * 1024, maxRedirects: 3, allowHttpErrors: true }))
    );

    for (const sub of subResults) {
      if (sub.status === 'fulfilled' && sub.value.statusCode === 200) {
        const sub$ = cheerio.load(sub.value.html);
        const subTitle = sub$('title').first().text().trim();
        const subDesc = sub$('meta[name="description"]').attr('content')?.trim() || '';
        const subH1 = sub$('h1').first().text().trim();
        const subCan = sub$('link[rel="canonical"]').attr('href')?.trim() || '';
        const subRobots = sub$('meta[name="robots"]').attr('content')?.trim() || '';
        const subWords = sub$('body').text().trim().split(/\s+/).filter(Boolean).length;
        const subLinks = sub$('a[href]').length;
        crawledPages.push({
          url: sub.value.finalUrl,
          statusCode: sub.value.statusCode,
          title: subTitle || '(Missing)',
          metaDescription: subDesc || '(Missing)',
          h1: subH1 || '(Missing)',
          canonical: subCan || '(Missing)',
          wordCount: subWords,
          internalLinksCount: subLinks,
          indexable: !subRobots.toLowerCase().includes('noindex'),
        });
      }
    }
  }

  // 12. Build Evidence-Based Issues & Technical Checks
  const issues: SEOIssue[] = [];
  const technicalChecks: TechnicalCheckItem[] = [];

  // Check: HTTPS & Redirects
  const isHttps = finalUrlObj.protocol === 'https:';
  const initialUrlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
  const startedAsHttp = initialUrlObj.protocol === 'http:';
  const redirectedHttpToHttps = startedAsHttp && isHttps;

  let httpsSeverity: SeverityLevel = 'PASSED';
  let httpsObserved = `HTTPS protocol active (${finalUrlObj.origin})`;
  let httpsExplanation = 'Website is securely served over encrypted HTTPS.';

  if (!isHttps) {
    httpsSeverity = 'CRITICAL';
    httpsObserved = `Insecure HTTP protocol (${finalUrlObj.origin})`;
    httpsExplanation = 'Website is served over unencrypted HTTP, which harms browser trust and organic visibility.';
  } else if (redirectedHttpToHttps) {
    httpsObserved = `HTTP correctly 301-redirected to HTTPS (${mainFetch.finalUrl})`;
    httpsExplanation = 'Initial HTTP request was automatically upgraded to HTTPS via safe redirect.';
  }

  technicalChecks.push({
    id: 'check-https',
    name: 'HTTPS Protocol Security',
    group: 'Protocol & Security',
    status: httpsSeverity,
    observedValue: httpsObserved,
    explanation: httpsExplanation,
    recommendation: !isHttps ? 'Enforce HTTPS with a valid TLS certificate and configure 301 redirects.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (!isHttps) {
    issues.push({
      id: 'issue-https',
      category: 'Technical',
      severity: 'CRITICAL',
      title: 'Website not served over secure HTTPS',
      description: 'The final resolved URL uses unencrypted HTTP protocol instead of HTTPS.',
      evidence: `Resolved URL is "${mainFetch.finalUrl}" using protocol "${finalUrlObj.protocol}".`,
      whyItMatters: 'HTTPS is an official Google ranking signal and prevents man-in-the-middle eavesdropping.',
      recommendation: 'Configure a valid TLS certificate on your server/CDN and enforce permanent 301 redirects from HTTP to HTTPS.',
      recommendedFix: 'Configure a valid TLS certificate on your server/CDN and enforce permanent 301 redirects from HTTP to HTTPS.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Medium',
      impactCategory: 'High',
      safetyClassification: 'MANUAL ONLY',
      autoFixable: false,
      requiresReview: true,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Configure server-side HTTPS redirection from http://${finalUrlObj.hostname} to https://${finalUrlObj.hostname} with 301 status.`,
      taskStatus: 'Pending',
    });
  }

  // Check: Title Tag
  const suggestedTitle =
    title && titleLen >= 30 && titleLen <= 60
      ? title
      : `${primaryTopic.slice(0, 38)} | ${finalUrlObj.hostname.replace(/^www\./, '')}`;

  technicalChecks.push({
    id: 'check-title',
    name: 'HTML <title> Element',
    group: 'Metadata & Head',
    status: titleStatus === 'Good' ? 'PASSED' : titleStatus === 'Missing' ? 'CRITICAL' : 'HIGH',
    observedValue: title ? `"${title}" (${titleLen} chars)` : 'Missing <title> tag',
    explanation: !title
      ? 'No <title> tag was found in the HTML document.'
      : titleLen < 30
      ? `Title is very short (${titleLen} chars). Recommended range is 30–60 characters to maximize relevance without truncation.`
      : titleLen > 60
      ? `Title is long (${titleLen} chars). Titles over 60 characters risk SERP truncation in search snippets.`
      : 'Title length is well-calibrated (30–60 characters) for search result display.',
    recommendation: titleStatus !== 'Good' ? `Set a concise title between 30 and 60 characters targeting "${primaryTopic}".` : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (titleStatus !== 'Good') {
    issues.push({
      id: 'issue-title',
      category: 'On-Page',
      severity: titleStatus === 'Missing' ? 'CRITICAL' : 'HIGH',
      title: titleStatus === 'Missing' ? 'Missing HTML <title> tag' : `Suboptimal <title> length (${titleLen} characters)`,
      description: titleStatus === 'Missing'
        ? 'The document head has no <title> element.'
        : `Title length (${titleLen} characters) falls outside the recommended 30–60 character range.`,
      evidence: title ? `Extracted <title>: "${title}" (${titleLen} characters).` : 'No <title> tag found in <head>.',
      whyItMatters: 'The <title> tag is the primary clickable headline in search results and a major relevance signal.',
      recommendation: `Update the <title> tag to between 30 and 60 characters leading with "${primaryTopic}".`,
      recommendedFix: `Update the <title> tag to between 30 and 60 characters leading with "${primaryTopic}".`,
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'High',
      safetyClassification: titleStatus === 'Missing' ? 'SAFE AUTO-FIX' : 'REVIEW REQUIRED',
      autoFixable: titleStatus === 'Missing',
      requiresReview: titleStatus !== 'Missing',
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Update the <title> tag on ${mainFetch.finalUrl} to "${suggestedTitle}".`,
      proposedFix: {
        id: 'fix-title',
        field: 'title',
        label: 'Optimize <title> Tag',
        safety: titleStatus === 'Missing' ? 'SAFE AUTO-FIX' : 'REVIEW REQUIRED',
        currentCode: title ? `<title>${title}</title>` : '<!-- Missing <title> -->',
        proposedCode: `<title>${suggestedTitle}</title>`,
        reason: 'Sets a concise, SERP-friendly title aligned with observed page content.',
      },
      taskStatus: 'Pending',
    });
  }

  // Check: Meta Description
  const proposedDescText =
    rawBodyText.length > 80
      ? `${rawBodyText.slice(0, 145).trim().replace(/\s+\S*$/, '')}.`
      : `Explore ${primaryTopic} on ${finalUrlObj.hostname}. Verified resources and solutions for ${targetMarket}.`;

  technicalChecks.push({
    id: 'check-meta-description',
    name: 'Meta Description',
    group: 'Metadata & Head',
    status: metaDescriptionStatus === 'Good' ? 'PASSED' : metaDescriptionStatus === 'Missing' ? 'HIGH' : 'MEDIUM',
    observedValue: metaDescription ? `"${metaDescription.slice(0, 80)}${descLen > 80 ? '...' : ''}" (${descLen} chars)` : 'Missing meta description',
    explanation: !metaDescription
      ? 'Page lacks a <meta name="description"> tag. Search engines will generate snippets from random body text.'
      : descLen < 70
      ? `Meta description is short (${descLen} chars). 70–160 characters is recommended to describe the page value.`
      : descLen > 160
      ? `Meta description is long (${descLen} chars). Descriptions over ~160 characters will be truncated in search snippets.`
      : 'Meta description length (70–160 characters) is optimal for SERP snippets.',
    recommendation: metaDescriptionStatus !== 'Good' ? 'Provide a unique, compelling meta description between 70 and 160 characters.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (metaDescriptionStatus !== 'Good') {
    issues.push({
      id: 'issue-meta-description',
      category: 'On-Page',
      severity: metaDescriptionStatus === 'Missing' ? 'HIGH' : 'MEDIUM',
      title: metaDescriptionStatus === 'Missing' ? 'Missing <meta name="description">' : `Meta description length (${descLen} chars) outside optimal range`,
      description: metaDescriptionStatus === 'Missing'
        ? 'No meta description tag was detected in document head.'
        : `Current description length (${descLen} chars) is outside the 70–160 character recommendation.`,
      evidence: metaDescription ? `Observed meta description: "${metaDescription}" (${descLen} chars).` : 'No meta[name="description"] element found in HTML.',
      whyItMatters: 'Meta descriptions directly influence organic click-through rate (CTR) in search results.',
      recommendation: 'Write an actionable 70–160 character meta description summarizing the page value proposition.',
      recommendedFix: 'Write an actionable 70–160 character meta description summarizing the page value proposition.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'High',
      safetyClassification: metaDescriptionStatus === 'Missing' ? 'SAFE AUTO-FIX' : 'REVIEW REQUIRED',
      autoFixable: metaDescriptionStatus === 'Missing',
      requiresReview: metaDescriptionStatus !== 'Missing',
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Add or update the <meta name="description"> tag on ${mainFetch.finalUrl} to: "${proposedDescText}"`,
      proposedFix: {
        id: 'fix-meta-description',
        field: 'meta_description',
        label: 'Add/Update Meta Description',
        safety: metaDescriptionStatus === 'Missing' ? 'SAFE AUTO-FIX' : 'REVIEW REQUIRED',
        currentCode: metaDescription ? `<meta name="description" content="${metaDescription}">` : '<!-- Missing meta description -->',
        proposedCode: `<meta name="description" content="${proposedDescText}">`,
        reason: 'Supplies a concise 70–160 character summary derived from page content.',
      },
      taskStatus: 'Pending',
    });
  }

  // Check: Canonical URL
  technicalChecks.push({
    id: 'check-canonical',
    name: 'Canonical Tag (<link rel="canonical">)',
    group: 'Indexability & Crawlability',
    status: canonicalStatus === 'Valid Self-Referencing' ? 'PASSED' : canonicalStatus === 'Missing' ? 'HIGH' : 'MEDIUM',
    observedValue: canonical ? `${canonical} (${canonicalStatus})` : 'Missing canonical link',
    explanation: canonicalStatus === 'Valid Self-Referencing'
      ? 'Self-referencing canonical URL matches the authoritative page URL.'
      : canonicalStatus === 'Missing'
      ? 'No canonical link element was found. Tracking query parameters could split index ranking signals.'
      : `Canonical URL (${canonical}) differs from analyzed URL (${mainFetch.finalUrl}). Note: Cross-domain canonicals may be intentional for syndicated content.`,
    recommendation: canonicalStatus === 'Missing' ? `Add <link rel="canonical" href="${mainFetch.finalUrl}" /> inside <head>.` : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (canonicalStatus === 'Missing') {
    issues.push({
      id: 'issue-canonical',
      category: 'Technical',
      severity: 'HIGH',
      title: 'Missing <link rel="canonical"> tag',
      description: 'The document does not specify a canonical URL in its <head> section.',
      evidence: `No link[rel="canonical"] element found in HTML of "${mainFetch.finalUrl}".`,
      whyItMatters: 'Canonical tags prevent duplicate content issues caused by URL parameters, session IDs, or trailing slashes.',
      recommendation: `Add <link rel="canonical" href="${mainFetch.finalUrl}" /> to the document <head>.`,
      recommendedFix: `Add <link rel="canonical" href="${mainFetch.finalUrl}" /> to the document <head>.`,
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'High',
      safetyClassification: 'SAFE AUTO-FIX',
      autoFixable: true,
      requiresReview: false,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Add <link rel="canonical" href="${mainFetch.finalUrl}" /> inside the <head> element.`,
      proposedFix: {
        id: 'fix-canonical',
        field: 'canonical',
        label: 'Add Self-Referencing Canonical Tag',
        safety: 'SAFE AUTO-FIX',
        currentCode: '<!-- Missing canonical tag -->',
        proposedCode: `<link rel="canonical" href="${mainFetch.finalUrl}" />`,
        reason: 'Consolidates indexing signals to the authoritative URL.',
      },
      taskStatus: 'Pending',
    });
  }

  // Check: Indexability Signals
  technicalChecks.push({
    id: 'check-indexability',
    name: 'Observable Indexability Signals',
    group: 'Indexability & Crawlability',
    status: indexabilitySignal === 'Allowed to crawl' ? 'PASSED' : 'CRITICAL',
    observedValue: `${indexabilitySignal} (meta: "${robotsMeta || 'default'}", X-Robots-Tag: "${xRobotsTag || 'none'}")`,
    explanation: indexabilitySignal === 'Allowed to crawl'
      ? 'No noindex directives or robots.txt blocks prevent search engines from crawling and indexing this page.'
      : indexabilitySignal === 'Noindex detected'
      ? 'Page has an explicit "noindex" directive, which instructs Google not to index this page.'
      : 'Robots.txt has a Disallow rule matching this URL path.',
    recommendation: indexabilitySignal !== 'Allowed to crawl' ? 'If this page should rank in search results, remove the noindex directive or disallow rule.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (indexabilitySignal === 'Noindex detected') {
    issues.push({
      id: 'issue-noindex',
      category: 'Indexability',
      severity: 'CRITICAL',
      title: 'Page has an explicit "noindex" directive',
      description: 'Search engines are instructed not to index this webpage.',
      evidence: `Observed noindex directive: meta robots="${robotsMeta}", X-Robots-Tag="${xRobotsTag}".`,
      whyItMatters: 'A noindex directive completely prevents the page from appearing in search engine results.',
      recommendation: 'Remove "noindex" from the meta robots tag or X-Robots-Tag HTTP header if this page should receive organic traffic.',
      recommendedFix: 'Remove "noindex" from the meta robots tag or X-Robots-Tag HTTP header if this page should receive organic traffic.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'High',
      safetyClassification: 'REVIEW REQUIRED',
      autoFixable: false,
      requiresReview: true,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Remove the "noindex" directive from the meta robots tag in ${mainFetch.finalUrl}.`,
      taskStatus: 'Pending',
    });
  }

  // Check: robots.txt
  technicalChecks.push({
    id: 'check-robots-txt',
    name: 'robots.txt Inspection',
    group: 'Indexability & Crawlability',
    status: robotsStatus === 'Exists' ? 'PASSED' : robotsStatus === 'Missing' ? 'MEDIUM' : 'LOW',
    observedValue: `${robotsStatus} (${robotsUrl}, HTTP ${robotsStatusCode ?? 'N/A'})`,
    explanation: robotsStatus === 'Exists'
      ? `robots.txt is present with ${relevantRules.length} relevant rule(s) and ${sitemapReferences.length} sitemap reference(s).`
      : 'No plain-text robots.txt file was found at domain root. Crawlers will assume all public URLs are crawlable.',
    recommendation: robotsStatus !== 'Exists' ? 'Publish a robots.txt file at domain root referencing your XML sitemap.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  // Check: XML Sitemap
  technicalChecks.push({
    id: 'check-sitemap',
    name: 'XML Sitemap Availability',
    group: 'Indexability & Crawlability',
    status: sitemapStatus === 'Found' ? 'PASSED' : 'MEDIUM',
    observedValue: sitemapStatus === 'Found'
      ? `Found (${sitemapFormat}: ${detectedSitemapUrl}${sitemapUrlCount !== null ? `, ~${sitemapUrlCount} URLs` : ''})`
      : `${sitemapStatus} (checked ${defaultSitemapUrl})`,
    explanation: sitemapStatus === 'Found'
      ? `An ${sitemapFormat} was located to assist search engine URL discovery.`
      : 'Could not detect an XML sitemap at /sitemap.xml or in robots.txt.',
    recommendation: sitemapStatus !== 'Found' ? 'Publish an XML sitemap at /sitemap.xml and declare it in robots.txt.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  // Check: H1 Heading
  const h1Status = h1.length === 1 ? 'PASSED' : h1.length === 0 ? 'HIGH' : 'MEDIUM';
  technicalChecks.push({
    id: 'check-h1',
    name: 'Primary Heading (<h1>)',
    group: 'Document & Headings',
    status: h1Status,
    observedValue: h1.length === 0
      ? '0 <h1> headings found'
      : `${h1.length} <h1> heading(s): "${h1[0].slice(0, 60)}"`,
    explanation: h1.length === 1
      ? 'Page contains exactly one clear primary <h1> heading.'
      : h1.length === 0
      ? 'Page lacks an <h1> heading, leaving topical hierarchy unanchored.'
      : `Page has ${h1.length} <h1> headings; standard convention recommends one primary <h1> per document.`,
    recommendation: h1Status !== 'PASSED' ? `Ensure exactly one <h1> heading aligned with "${primaryTopic}".` : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (h1Status !== 'PASSED') {
    issues.push({
      id: 'issue-h1',
      category: 'On-Page',
      severity: h1Status,
      title: h1.length === 0 ? 'Missing primary <h1> heading' : `Multiple <h1> headings detected (${h1.length})`,
      description: h1.length === 0
        ? 'No <h1> heading was found in the document.'
        : `Document contains ${h1.length} <h1> headings, which dilutes topical hierarchy.`,
      evidence: h1.length === 0 ? 'Zero <h1> tags found in HTML DOM.' : `Extracted <h1> tags: ${h1.slice(0, 3).map((t) => `"${t}"`).join(', ')}.`,
      whyItMatters: 'The <h1> heading defines the main subject of the page for users and search engine crawlers.',
      recommendation: h1.length === 0 ? `Add one primary <h1> heading targeting "${primaryTopic}".` : 'Keep one primary <h1> and convert secondary <h1>s into <h2> subheadings.',
      recommendedFix: h1.length === 0 ? `Add one primary <h1> heading targeting "${primaryTopic}".` : 'Keep one primary <h1> and convert secondary <h1>s into <h2> subheadings.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'High',
      safetyClassification: 'REVIEW REQUIRED',
      autoFixable: false,
      requiresReview: true,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Ensure ${mainFetch.finalUrl} contains exactly one primary <h1> tag representing "${primaryTopic}".`,
      taskStatus: 'Pending',
    });
  }

  // Check: Heading Hierarchy & Empty Headings
  const headingStructureStatus = hierarchyIssues.length === 0 && emptyHeadingsCount === 0 ? 'PASSED' : 'LOW';
  technicalChecks.push({
    id: 'check-heading-hierarchy',
    name: 'Heading Structure (H1 → H2 → H3)',
    group: 'Document & Headings',
    status: headingStructureStatus,
    observedValue: `H1: ${h1.length} · H2: ${h2.length} · H3: ${h3.length} · Empty: ${emptyHeadingsCount} · Skipped: ${hierarchyIssues.length}`,
    explanation: hierarchyIssues.length > 0
      ? hierarchyIssues[0]
      : emptyHeadingsCount > 0
      ? `Found ${emptyHeadingsCount} empty heading tag(s) without text.`
      : 'Heading structure follows a logical semantic hierarchy.',
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  // Check: Image Alt Attributes
  const imgAltStatus: SeverityLevel = images.totalImages === 0 || images.imagesWithoutAlt === 0
    ? 'PASSED'
    : images.imagesWithoutAlt > 3
    ? 'MEDIUM'
    : 'LOW';

  technicalChecks.push({
    id: 'check-img-alt',
    name: 'Image Alt Text Coverage',
    group: 'Links & Media',
    status: imgAltStatus,
    observedValue: images.totalImages === 0
      ? '0 <img> tags found'
      : `${images.imagesWithAlt}/${images.totalImages} images have alt text (${images.coveragePercent}% coverage)`,
    explanation: images.imagesWithoutAlt === 0
      ? 'All images have alt attributes (or valid decorative alt="").'
      : `${images.imagesWithoutAlt} image(s) lack alt attributes. Note: Decorative images should have empty alt="", while informative images require concise descriptions.`,
    recommendation: images.imagesWithoutAlt > 0 ? 'Add descriptive alt text to informative images and empty alt="" to decorative images.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (images.imagesWithoutAlt > 0) {
    issues.push({
      id: 'issue-img-alt',
      category: 'On-Page',
      severity: imgAltStatus,
      title: `${images.imagesWithoutAlt} image(s) missing alt attributes`,
      description: 'Multiple images on this page lack the alt attribute required for accessibility and image search context.',
      evidence: `Found ${images.imagesWithoutAlt} of ${images.totalImages} images without alt attributes (${images.coveragePercent}% coverage).`,
      whyItMatters: 'Alt text is required by WCAG accessibility standards and provides semantic context for image indexing.',
      recommendation: 'Add descriptive alt text to informative images. For purely decorative images (icons, dividers), use empty alt="" rather than keyword stuffing.',
      recommendedFix: 'Add descriptive alt text to informative images. For purely decorative images (icons, dividers), use empty alt="" rather than keyword stuffing.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'Medium',
      safetyClassification: 'SAFE AUTO-FIX',
      autoFixable: true,
      requiresReview: false,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Add appropriate alt attributes to the ${images.imagesWithoutAlt} <img> tags missing alt text on ${mainFetch.finalUrl}.`,
      proposedFix: {
        id: 'fix-image-alt',
        field: 'image_alt',
        label: 'Populate Missing Image Alt Attributes',
        safety: 'SAFE AUTO-FIX',
        currentCode: '<img src="..." />',
        proposedCode: `<img src="..." alt="${primaryTopic} illustration" />`,
        reason: 'Adds fallback contextual alt attributes to images missing alt text.',
      },
      taskStatus: 'Pending',
    });
  }

  // Check: Internal Links & Anchor Text
  const internalLinkStatus: SeverityLevel = totalInternalLinks >= 5 ? 'PASSED' : totalInternalLinks === 0 ? 'HIGH' : 'MEDIUM';
  technicalChecks.push({
    id: 'check-internal-links',
    name: 'Internal Link Architecture',
    group: 'Links & Media',
    status: internalLinkStatus,
    observedValue: `${totalInternalLinks} internal link(s) (${observedInternal.length} unique URLs) · ${emptyAnchorCount} empty anchor(s)`,
    explanation: totalInternalLinks >= 5
      ? 'Page contains internal contextual links aiding crawl discovery.'
      : 'Very few internal links found on page. Internal links pass crawl equity to related content.',
    recommendation: totalInternalLinks < 5 ? 'Add internal contextual links pointing to priority topic and service pages.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (emptyAnchorCount > 0 || genericAnchorCount > 0) {
    issues.push({
      id: 'issue-anchors',
      category: 'Internal Linking',
      severity: 'LOW',
      title: `${emptyAnchorCount} empty or ${genericAnchorCount} generic anchor text link(s)`,
      description: 'Links with empty text or generic phrases like "click here" / "read more" do not pass descriptive topical context.',
      evidence: `Found ${emptyAnchorCount} empty anchor links and ${genericAnchorCount} generic anchor phrases.`,
      whyItMatters: 'Descriptive anchor text helps search engines and screen readers understand the destination page topic.',
      recommendation: 'Replace generic anchor text with descriptive 2–5 word phrases describing the destination content.',
      recommendedFix: 'Replace generic anchor text with descriptive 2–5 word phrases describing the destination content.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'Medium',
      safetyClassification: 'REVIEW REQUIRED',
      autoFixable: false,
      requiresReview: true,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Replace generic anchor text like "click here" or "read more" on ${mainFetch.finalUrl} with descriptive destination anchor phrases.`,
      taskStatus: 'Pending',
    });
  }

  // Check: HTML Language
  const langStatus: SeverityLevel = lang ? 'PASSED' : 'MEDIUM';
  technicalChecks.push({
    id: 'check-lang',
    name: 'HTML Language Declaration (lang)',
    group: 'Document & Headings',
    status: langStatus,
    observedValue: lang ? `<html lang="${lang}">` : 'Missing lang attribute on <html>',
    explanation: lang
      ? `Document language explicitly declared as "${lang}".`
      : 'Missing lang attribute affects accessibility screen readers and regional search engines.',
    recommendation: !lang ? 'Add lang="en" (or your target language code) to the <html> tag.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (!lang) {
    issues.push({
      id: 'issue-lang',
      category: 'Technical',
      severity: 'MEDIUM',
      title: 'Missing lang attribute on <html> tag',
      description: 'The root <html> element does not specify a language attribute.',
      evidence: 'Root <html> tag lacks a lang attribute in HTML DOM.',
      whyItMatters: 'Screen readers and search engines use the lang attribute to determine document language.',
      recommendation: 'Add lang="en" (or the appropriate ISO language code) to the <html> tag.',
      recommendedFix: 'Add lang="en" (or the appropriate ISO language code) to the <html> tag.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'Medium',
      safetyClassification: 'SAFE AUTO-FIX',
      autoFixable: true,
      requiresReview: false,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: 'Add lang="en" attribute to the root <html> tag.',
      proposedFix: {
        id: 'fix-lang',
        field: 'html_lang',
        label: 'Add HTML lang="en" Attribute',
        safety: 'SAFE AUTO-FIX',
        currentCode: '<html>',
        proposedCode: '<html lang="en">',
        reason: 'Declares primary document language for accessibility and search indexing.',
      },
      taskStatus: 'Pending',
    });
  }

  // Check: Viewport
  const hasViewport = viewport.includes('width=device-width');
  technicalChecks.push({
    id: 'check-viewport',
    name: 'Mobile Viewport Meta Tag',
    group: 'Metadata & Head',
    status: hasViewport ? 'PASSED' : 'HIGH',
    observedValue: viewport || 'Missing <meta name="viewport">',
    explanation: hasViewport
      ? 'Configured for mobile-responsive rendering.'
      : 'Missing mobile viewport tag. Mobile-first indexing requires responsive viewport configuration.',
    recommendation: !hasViewport ? 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0" /> in <head>.' : undefined,
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (!hasViewport) {
    issues.push({
      id: 'issue-viewport',
      category: 'Technical',
      severity: 'HIGH',
      title: 'Missing mobile viewport meta tag',
      description: 'The document does not include a responsive viewport declaration.',
      evidence: `Observed viewport content: "${viewport || 'none'}".`,
      whyItMatters: 'Google evaluates mobile usability as part of mobile-first indexing.',
      recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0" /> inside <head>.',
      recommendedFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0" /> inside <head>.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'High',
      safetyClassification: 'SAFE AUTO-FIX',
      autoFixable: true,
      requiresReview: false,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: 'Add <meta name="viewport" content="width=device-width, initial-scale=1.0" /> to <head>.',
      proposedFix: {
        id: 'fix-viewport',
        field: 'viewport',
        label: 'Add Responsive Viewport Meta Tag',
        safety: 'SAFE AUTO-FIX',
        currentCode: viewport ? `<meta name="viewport" content="${viewport}">` : '<!-- Missing viewport -->',
        proposedCode: '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        reason: 'Configures mobile-friendly responsive layout rendering.',
      },
      taskStatus: 'Pending',
    });
  }

  // Check: JSON-LD Structured Data
  const sdStatus: SeverityLevel = invalidJsonLd > 0 ? 'HIGH' : structuredItems.length === 0 ? 'MEDIUM' : 'PASSED';
  technicalChecks.push({
    id: 'check-structured-data',
    name: 'JSON-LD Structured Data',
    group: 'Social & Structured Data',
    status: sdStatus,
    observedValue: structuredItems.length === 0
      ? '0 JSON-LD scripts detected'
      : `${validJsonLd} valid, ${invalidJsonLd} invalid (${Array.from(allSchemaTypes).join(', ') || 'Unspecified'})`,
    explanation: invalidJsonLd > 0
      ? 'One or more JSON-LD blocks have syntax errors and cannot be parsed.'
      : structuredItems.length === 0
      ? 'No Schema.org JSON-LD structured data found on this page.'
      : 'Valid JSON-LD schema blocks detected.',
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (invalidJsonLd > 0 || structuredItems.length === 0) {
    issues.push({
      id: 'issue-structured-data',
      category: 'Structured Data',
      severity: sdStatus,
      title: invalidJsonLd > 0 ? `Invalid JSON-LD syntax in ${invalidJsonLd} block(s)` : 'No Schema.org JSON-LD structured data detected',
      description: invalidJsonLd > 0
        ? 'Syntax error in application/ld+json script prevents search engines from parsing rich snippet eligibility.'
        : 'Page does not declare structured data schemas (Organization, WebSite, Article, etc.).',
      evidence: invalidJsonLd > 0
        ? structuredItems.find((i) => !i.valid)?.issues[0] || 'Invalid JSON syntax.'
        : 'Zero <script type="application/ld+json"> blocks found.',
      whyItMatters: 'Structured data enables rich search results and entity disambiguation in Google Search.',
      recommendation: invalidJsonLd > 0
        ? 'Fix JSON syntax errors in application/ld+json blocks.'
        : `Add valid Schema.org JSON-LD (e.g. WebSite, Organization, or ${probableSearchIntent === 'Informational' ? 'Article' : 'WebPage'}) matching visible content. Never fabricate fake reviews or ratings.`,
      recommendedFix: invalidJsonLd > 0
        ? 'Fix JSON syntax errors in application/ld+json blocks.'
        : `Add valid Schema.org JSON-LD (e.g. WebSite, Organization, or ${probableSearchIntent === 'Informational' ? 'Article' : 'WebPage'}) matching visible content. Never fabricate fake reviews or ratings.`,
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Low',
      impactCategory: 'Medium',
      safetyClassification: 'REVIEW REQUIRED',
      autoFixable: false,
      requiresReview: true,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Add validated Schema.org JSON-LD (<script type="application/ld+json">) to ${mainFetch.finalUrl} representing the page entity without fabricating reviews or ratings.`,
      taskStatus: 'Pending',
    });
  }

  // Check: Open Graph
  technicalChecks.push({
    id: 'check-open-graph',
    name: 'Open Graph Protocol Metadata',
    group: 'Social & Structured Data',
    status: openGraph.hasCoreTags ? 'PASSED' : 'LOW',
    observedValue: openGraph.presentCount > 0
      ? `${openGraph.presentCount} tags present (missing: ${openGraph.missingRequired.join(', ') || 'none'})`
      : 'No og:* tags detected',
    explanation: openGraph.hasCoreTags
      ? 'Core og:title and og:description tags are present.'
      : 'Missing og:title or og:description tags affects link preview generation on social and messaging platforms.',
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  // Check: Twitter Metadata
  technicalChecks.push({
    id: 'check-twitter',
    name: 'Twitter / X Card Metadata',
    group: 'Social & Structured Data',
    status: twitterCard.presentCount > 0 ? 'PASSED' : 'LOW',
    observedValue: twitterCard.presentCount > 0
      ? `${twitterCard.presentCount} tag(s) (card: ${twitterCard.cardType || 'unspecified'})`
      : 'No twitter:* tags detected',
    explanation: twitterCard.presentCount > 0
      ? 'Twitter card metadata present.'
      : 'Adding twitter:card and twitter:title provides customized card previews when shared.',
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  // Check: Content Depth
  const contentDepthStatus: SeverityLevel = wordCount >= 300 ? 'PASSED' : wordCount < 100 ? 'HIGH' : 'MEDIUM';
  technicalChecks.push({
    id: 'check-content-depth',
    name: 'Visible Content Depth',
    group: 'Document & Headings',
    status: contentDepthStatus,
    observedValue: `${wordCount} words · Ratio: ${textToHtmlRatioPercent}% · ${contentDepthAssessment}`,
    explanation: wordCount >= 300
      ? 'Reasonably substantial text content observed in initial HTML response.'
      : wordCount < 100
      ? 'Very thin crawlable text observed in server-returned HTML.'
      : 'Content depth may be insufficient for the apparent topic.',
    dataSource: 'OBSERVED_WEBSITE_DATA',
  });

  if (wordCount < 200 && !isJavaScriptRenderedLikely) {
    issues.push({
      id: 'issue-content-depth',
      category: 'Content',
      severity: wordCount < 100 ? 'HIGH' : 'MEDIUM',
      title: `Low visible text content (${wordCount} words observed)`,
      description: 'The page contains limited visible body text in the initial server-rendered HTML response.',
      evidence: `Extracted ${wordCount} words and ${sentenceCount} sentences from HTML body (text-to-HTML ratio: ${textToHtmlRatioPercent}%).`,
      whyItMatters: 'Content depth may be insufficient for the apparent topic and search intent.',
      recommendation: 'Expand on-page text to address user search questions, specifications, and structured subtopics.',
      recommendedFix: 'Expand on-page text to address user search questions, specifications, and structured subtopics.',
      affectedUrl: mainFetch.finalUrl,
      difficulty: 'Medium',
      impactCategory: 'High',
      safetyClassification: 'MANUAL ONLY',
      autoFixable: false,
      requiresReview: true,
      dataSource: 'OBSERVED_WEBSITE_DATA',
      fixPrompt: `Expand the on-page copy on ${mainFetch.finalUrl} around "${primaryTopic}" with structured H2 subtopics and helpful answers.`,
      taskStatus: 'Pending',
    });
  }

  // 13. Calculate Evidence-Based Transparent Diagnostic Scores (Prompt 2 Section 20)
  // Weighted categories:
  // - Technical & Indexability: 30%
  // - On-Page Structure & Headings: 25%
  // - Content & Keywords: 20%
  // - Mobile & Performance Signals: 15%
  // - Social & Structured Data: 10%
  const calcScore = (penalties: number) => Math.max(10, Math.min(100, Math.round(100 - penalties)));

  // Technical & Indexability (30%)
  const techPenalties =
    (!isHttps ? 30 : 0) +
    (mainFetch.redirectChain.length > 1 ? 10 : 0) +
    (!hasViewport ? 15 : 0) +
    (!lang ? 8 : 0) +
    (robotsStatus !== 'Exists' ? 8 : 0) +
    (hasNoindex || blocksCurrentPath ? 50 : 0) +
    (hasNofollow ? 15 : 0) +
    (canonicalStatus === 'Missing' ? 15 : canonicalStatus === 'Cross-URL / Mismatched' || multipleCanonical ? 10 : 0) +
    (sitemapStatus !== 'Found' ? 10 : 0);
  const technicalIndexability = calcScore(techPenalties * 0.65);
  const technicalScore = calcScore(
    (!isHttps ? 30 : 0) +
      (mainFetch.redirectChain.length > 1 ? 10 : 0) +
      (!hasViewport ? 18 : 0) +
      (!lang ? 8 : 0) +
      (robotsStatus !== 'Exists' ? 8 : 0)
  );
  const indexabilityScore = calcScore(
    (hasNoindex || blocksCurrentPath ? 65 : 0) +
      (hasNofollow ? 20 : 0) +
      (canonicalStatus === 'Missing' ? 18 : canonicalStatus === 'Cross-URL / Mismatched' || multipleCanonical ? 12 : 0) +
      (sitemapStatus !== 'Found' ? 12 : 0)
  );

  // On-Page Structure & Headings (25%)
  const onPagePenalties =
    (titleStatus === 'Missing' ? 30 : titleStatus === 'Needs Improvement' ? 12 : 0) +
    (metaDescriptionStatus === 'Missing' ? 24 : metaDescriptionStatus === 'Needs Improvement' ? 10 : 0) +
    (h1.length === 0 ? 25 : h1.length > 1 ? 12 : 0) +
    (hierarchyIssues.length > 0 ? 10 : 0) +
    (images.imagesWithoutAlt > 0 ? Math.min(15, images.imagesWithoutAlt * 3) : 0) +
    (emptyAnchorCount > 0 ? 8 : 0);
  const onPageHeadings = calcScore(onPagePenalties);
  const onPageScore = onPageHeadings;

  // Content & Keywords (20%)
  const contentPenalties =
    (wordCount < 100 ? 45 : wordCount < 300 ? 25 : wordCount < 600 ? 10 : 0) +
    (h2.length < 2 ? 15 : 0) +
    (duplicateHeadings.length > 0 ? 8 : 0) +
    (topObservedTerms.length < 3 ? 12 : 0);
  const contentKeywords = calcScore(contentPenalties);
  const contentScore = contentKeywords;

  // Mobile & Performance Signals (15%)
  const perfPenalties =
    (!hasViewport ? 30 : 0) +
    (mainFetch.responseTimeMs > 2500 ? 25 : mainFetch.responseTimeMs > 1200 ? 12 : 0) +
    (renderBlockingScripts > 2 ? 18 : renderBlockingScripts > 0 ? 8 : 0) +
    (images.imagesWithoutDimensions > 2 ? 10 : 0) +
    (mainFetch.byteLength > 500_000 ? 12 : 0);
  const mobilePerformance = calcScore(perfPenalties);
  const performanceScore = mobilePerformance;

  // Social & Structured Data (10%)
  const socialPenalties =
    (invalidJsonLd > 0 ? 45 : structuredItems.length === 0 ? 30 : 0) +
    (!openGraph.hasCoreTags ? 15 : 0) +
    (twitterCard.presentCount === 0 ? 10 : 0);
  const socialStructuredData = calcScore(socialPenalties);
  const structuredDataScore = socialStructuredData;

  const overall = Math.round(
    technicalIndexability * 0.30 +
      onPageHeadings * 0.25 +
      contentKeywords * 0.20 +
      mobilePerformance * 0.15 +
      socialStructuredData * 0.10
  );

  const formulaBreakdown = `Technical & Indexability (${technicalIndexability} × 30%) + On-Page & Headings (${onPageHeadings} × 25%) + Content & Keywords (${contentKeywords} × 20%) + Mobile & Performance (${mobilePerformance} × 15%) + Social & Structured Data (${socialStructuredData} × 10%) = ${overall}/100`;

  const counts = {
    critical: issues.filter((i) => i.severity === 'CRITICAL').length,
    high: issues.filter((i) => i.severity === 'HIGH').length,
    medium: issues.filter((i) => i.severity === 'MEDIUM').length,
    low: issues.filter((i) => i.severity === 'LOW').length,
    passed: technicalChecks.filter((c) => c.status === 'PASSED').length,
  };

  // 14. On-Page Items Matrix
  const onPageItems: OnPageItem[] = [
    {
      id: 'onpage-title',
      element: 'Title Tag (<title>)',
      status: titleStatus === 'Good' ? 'PASSED' : titleStatus === 'Missing' ? 'CRITICAL' : 'HIGH',
      currentState: title ? `"${title}" (${titleLen} chars)` : 'Missing <title>',
      problem: titleStatus === 'Good'
        ? 'Well-configured (30–60 characters).'
        : titleStatus === 'Missing'
        ? 'Document has no <title> tag.'
        : `Title length (${titleLen} chars) is outside optimal 30–60 character length.`,
      whyItMatters: 'Primary search relevance signal and clickable search headline.',
      recommendedChange: `Target 30–60 characters leading with primary topic "${primaryTopic}".`,
      suggestedImplementation: `<title>${suggestedTitle}</title>`,
    },
    {
      id: 'onpage-desc',
      element: 'Meta Description',
      status: metaDescriptionStatus === 'Good' ? 'PASSED' : metaDescriptionStatus === 'Missing' ? 'HIGH' : 'MEDIUM',
      currentState: metaDescription ? `"${metaDescription}" (${descLen} chars)` : 'Missing meta description',
      problem: metaDescriptionStatus === 'Good'
        ? 'Optimal length (70–160 characters).'
        : metaDescriptionStatus === 'Missing'
        ? 'Missing meta description tag.'
        : `Length (${descLen} chars) is outside 70–160 character recommendation.`,
      whyItMatters: 'Directly influences click-through rate when rendered as search snippet.',
      recommendedChange: 'Write an actionable 70–160 character summary matching search intent.',
      suggestedImplementation: `<meta name="description" content="${proposedDescText}" />`,
    },
    {
      id: 'onpage-h1',
      element: 'H1 Primary Heading',
      status: h1Status,
      currentState: h1.length > 0 ? `${h1.length} H1: "${h1.join(' | ').slice(0, 80)}"` : 'Missing H1',
      problem: h1.length === 1
        ? 'Single primary H1 is present.'
        : h1.length === 0
        ? 'No H1 tag found on page.'
        : `${h1.length} H1 tags compete for primary heading focus.`,
      whyItMatters: 'Anchors the main subject of the document.',
      recommendedChange: 'Ensure exactly one H1 tag aligned with page intent.',
      suggestedImplementation: `<h1>${h1[0] || primaryTopic}</h1>`,
    },
    {
      id: 'onpage-headings',
      element: 'H2 / H3 Subheading Structure',
      status: h2.length >= 2 && hierarchyIssues.length === 0 ? 'PASSED' : 'MEDIUM',
      currentState: `${h2.length} H2 tags · ${h3.length} H3 tags`,
      problem: h2.length < 2
        ? 'Few H2 subheadings to structure semantic topic coverage.'
        : hierarchyIssues.length > 0
        ? hierarchyIssues[0]
        : 'Subheadings are structured logically.',
      whyItMatters: 'Subheadings break content into scannable sections and capture long-tail queries.',
      recommendedChange: 'Use H2 tags for major subtopics and H3 tags for nested sections without skipping levels.',
      suggestedImplementation: `<h2>Overview and Core Principles of ${primaryTopic}</h2>`,
    },
    {
      id: 'onpage-content-depth',
      element: 'Content Depth & Text Ratio',
      status: contentDepthStatus,
      currentState: `${wordCount} words · Ratio: ${textToHtmlRatioPercent}% · ${contentDepthAssessment}`,
      problem: wordCount >= 300
        ? 'Substantial visible copy in initial HTML response.'
        : isJavaScriptRenderedLikely
        ? 'Minimal server-rendered text; page appears to rely on client-side JavaScript.'
        : 'Content depth may be insufficient for the apparent topic.',
      whyItMatters: 'Thorough coverage of primary and semantic entities is essential for competitive search visibility.',
      recommendedChange: `Provide comprehensive, original answers aligned with ${probableSearchIntent} intent.`,
      suggestedImplementation: 'Add structured sections answering common user queries and providing verifiable specifics.',
    },
    {
      id: 'onpage-anchors',
      element: 'Internal Links & Anchor Text Quality',
      status: emptyAnchorCount === 0 && genericAnchorCount === 0 && totalInternalLinks >= 5 ? 'PASSED' : 'MEDIUM',
      currentState: `${totalInternalLinks} internal links (${emptyAnchorCount} empty, ${genericAnchorCount} generic anchors)`,
      problem: emptyAnchorCount > 0 || genericAnchorCount > 0
        ? 'Links found with empty text or generic phrases like "click here".'
        : totalInternalLinks < 5
        ? 'Limited internal link pathways.'
        : 'Anchor text distribution is descriptive.',
      whyItMatters: 'Descriptive anchor text signals destination page topic to search engines.',
      recommendedChange: 'Use descriptive 2–5 word anchor phrases describing the target page.',
      suggestedImplementation: `<a href="/solutions">Explore ${primaryTopic} Solutions</a>`,
    },
  ];

  // 15. Content Intelligence Data
  const contentIntelligence: ContentIntelligenceData = {
    primaryTopic,
    secondaryTopics: Array.from(new Set(secondaryTopics)).slice(0, 6),
    probableSearchIntent,
    wordCount,
    characterCount,
    sentenceCount,
    paragraphCount,
    textToHtmlRatioPercent,
    contentDepthAssessment,
    isJavaScriptRenderedLikely,
    jsRenderNotice,
    readabilitySummary,
    topObservedTerms,
    contentGaps: [
      h2.length < 3
        ? `Insufficient H2 subtopic segmentation around "${primaryTopic}" (only ${h2.length} H2 tags observed).`
        : `Opportunity to deepen comparative and FAQ coverage for "${primaryTopic}" in ${targetMarket}.`,
      !lowerBody.includes('faq') && !lowerBody.includes('frequently asked')
        ? 'No dedicated FAQ section detected to capture conversational voice and long-tail queries.'
        : 'Expand structured Q&A coverage with concise 40–60 word direct answers.',
      wordCount < 600
        ? `Page word count (${wordCount} words) leaves room for deeper semantic entity coverage.`
        : `Add updated benchmark data or localized ${targetMarket} case evidence to strengthen authority.`,
    ],
    topicalAuthorityOpportunities: [
      `Build a dedicated topic cluster hub around "${primaryTopic}" linking to specialized sub-pages.`,
      `Publish original methodology or case results to strengthen Experience and Authority signals.`,
      `Structure subheadings around high-intent questions users ask before selecting a solution for "${primaryGoal}".`,
    ],
    missingSupportingPages: [
      `Comprehensive Architecture & Workflow Guide for ${primaryTopic}`,
      `Comparison & Decision Matrix (${primaryTopic} in ${targetMarket})`,
      `Implementation Checklist & Frequently Asked Questions`,
    ],
    intentOpportunities: {
      informational: [
        `How ${primaryTopic} works: step-by-step principles & architecture`,
        `Common mistakes to avoid when evaluating ${primaryTopic}`,
      ],
      commercial: [
        `${primaryTopic} evaluation criteria and feature comparison in ${targetMarket}`,
        `Case studies and measurable benchmarks for ${primaryTopic}`,
      ],
      transactional: [
        `Get started / request interactive assessment for ${primaryTopic}`,
        `Onboarding workflow, specifications, and package options`,
      ],
      navigational: [
        `Official documentation, product directory, and support hub links`,
      ],
    },
    topicCluster: {
      pillarPage: `${primaryTopic} — Complete Resource Hub`,
      pillarTargetUrl: mainFetch.finalUrl,
      supportingArticles: [
        {
          title: `The Definitive Guide to ${primaryTopic}: Architecture & Best Practices`,
          intent: 'Informational',
          suggestedInternalLinkFrom: mainFetch.finalUrl,
          suggestedAnchorText: `complete ${primaryTopic.toLowerCase()} guide`,
          rationale: 'Captures informational researchers and passes topical authority back to the pillar page.',
        },
        {
          title: `How to Evaluate ${primaryTopic} for ${primaryGoal} in ${targetMarket}`,
          intent: 'Commercial',
          suggestedInternalLinkFrom: mainFetch.finalUrl,
          suggestedAnchorText: `${primaryTopic.toLowerCase()} evaluation criteria`,
          rationale: 'Addresses mid-funnel commercial comparison intent for decision makers.',
        },
        {
          title: `${primaryTopic} Implementation Checklist & Technical Blueprint`,
          intent: 'Transactional',
          suggestedInternalLinkFrom: mainFetch.finalUrl,
          suggestedAnchorText: `${primaryTopic.toLowerCase()} implementation checklist`,
          rationale: 'Supports high-intent users ready to implement.',
        },
      ],
    },
    searchVolumeDisclaimer:
      'Exact global search volume is unavailable because no authorized keyword-data provider is connected.',
  };

  // 16. Internal Linking Recommendations (Strictly observed URLs)
  const linkRecommendations = sortedInternalAsc
    .filter((l) => l.href !== mainFetch.finalUrl)
    .slice(0, 5)
    .map((target) => {
      const cleanPath = new URL(target.href).pathname.replace(/^\/|\/$/g, '').replace(/[-_/]/g, ' ');
      const betterAnchor =
        target.anchorText && target.anchorText !== '(Empty anchor)' && !GENERIC_ANCHORS.has(target.anchorText.toLowerCase())
          ? target.anchorText
          : cleanPath || `${primaryTopic} guide`;
      return {
        sourcePage: mainFetch.finalUrl,
        targetPage: target.href,
        suggestedAnchor: betterAnchor,
        reason:
          target.occurrences === 1
            ? `Target URL receives only 1 link on ${mainFetch.finalUrl}; adding a contextual body link improves crawl equity.`
            : `Ensure anchor text ("${betterAnchor}") clearly describes destination content.`,
      };
    });

  const internalLinking: InternalLinkAnalysis = {
    totalInternalLinks,
    totalExternalLinks,
    uniqueInternalTargets: observedInternal.length,
    uniqueExternalDomains,
    emptyAnchorCount,
    genericAnchorCount,
    emptyHrefCount,
    fragmentOnlyCount,
    nofollowInternalCount,
    topLinkedInternalPages: sortedInternalDesc.slice(0, 8).map((l) => ({
      url: l.href,
      count: l.occurrences,
      sampleAnchor: l.anchorText,
    })),
    lowLinkedInternalPages: sortedInternalAsc.slice(0, 8).map((l) => ({
      url: l.href,
      count: l.occurrences,
      sampleAnchor: l.anchorText,
    })),
    observedLinks: observedInternal,
    externalLinks: observedExternal,
    orphanDetectionNote:
      crawlMode === 'single'
        ? 'Single-page audit mode: Only links present on the audited URL are observed. Enable Multi-Page Crawl or compare against your XML sitemap to identify true orphan pages.'
        : `Inspected ${crawledPages.length} pages. Pages receiving only 1 incoming link have higher risk of low crawl frequency.`,
    recommendations: linkRecommendations,
  };

  // 17. Structured Data Suggestions (Relevant types only)
  const suggestedSchemaTypes: { type: string; reason: string }[] = [];
  if (!allSchemaTypes.has('Organization') && !allSchemaTypes.has('LocalBusiness')) {
    suggestedSchemaTypes.push({
      type: primaryGoal === 'Improve Local Visibility' ? 'LocalBusiness' : 'Organization',
      reason: 'Establishes official brand identity, logo, and canonical URL in Knowledge Graph.',
    });
  }
  if (!allSchemaTypes.has('WebSite')) {
    suggestedSchemaTypes.push({
      type: 'WebSite',
      reason: 'Declares site-level identity and canonical domain structure.',
    });
  }
  if (!allSchemaTypes.has('WebPage') && !allSchemaTypes.has('Article')) {
    suggestedSchemaTypes.push({
      type: probableSearchIntent === 'Informational' ? 'Article' : 'WebPage',
      reason: `Matches observed ${probableSearchIntent.toLowerCase()} content structure on ${mainFetch.finalUrl}.`,
    });
  }

  const structuredData: StructuredDataAudit = {
    detectedScriptsCount: structuredItems.length,
    schemaTypes: Array.from(allSchemaTypes),
    validCount: validJsonLd,
    invalidCount: invalidJsonLd,
    contentAlignmentNote: structuredItems.length === 0
      ? 'No JSON-LD structured data present to compare against visible HTML.'
      : invalidJsonLd > 0
      ? 'One or more JSON-LD blocks contain syntax errors and cannot be validated.'
      : 'Detected JSON-LD blocks parse cleanly; verify that schema fields match visible DOM text.',
    items: structuredItems,
    suggestedSchemaTypes,
  };

  return {
    auditId: `zyven-${Date.now()}`,
    url,
    finalUrl: mainFetch.finalUrl,
    targetMarket,
    customMarket,
    primaryGoal,
    auditDate: new Date().toISOString(),
    crawlMode,
    statusCode: mainFetch.statusCode,
    contentType: mainFetch.contentType,
    redirectChain: mainFetch.redirectChain,
    scores: {
      overall,
      technicalIndexability,
      onPageHeadings,
      contentKeywords,
      mobilePerformance,
      socialStructuredData,
      formulaBreakdown,
      technical: technicalScore,
      onPage: onPageScore,
      content: contentScore,
      indexability: indexabilityScore,
      structuredData: structuredDataScore,
      performance: performanceScore,
      label: 'ZyvenSEO Diagnostic Score — not a Google ranking score.',
    },
    counts,
    metadata: {
      title,
      titleLength: titleLen,
      titleStatus,
      metaDescription,
      metaDescriptionLength: descLen,
      metaDescriptionStatus,
      canonical,
      canonicalStatus,
      multipleCanonical,
      robotsMeta,
      xRobotsTag,
      robotsDirectives,
      indexabilityVerdict,
      indexabilityReason,
      indexabilitySignal,
      viewport,
      lang,
      charset,
      favicon,
      openGraph,
      twitterCard,
      hreflangTags,
      lastModifiedHeader: mainFetch.headers['last-modified'] || 'Not present',
    },
    robotsTxt: {
      checkedUrl: robotsUrl,
      available: robotsAvailable,
      status: robotsStatus,
      statusCode: robotsStatusCode,
      blocksCurrentPath,
      relevantRules,
      sitemapReferences,
      preview: robotsPreview,
    },
    sitemapXml: {
      checkedUrl: sitemapCheckedUrl,
      available: sitemapAvailable,
      status: sitemapStatus,
      format: sitemapFormat,
      statusCode: sitemapStatusCode,
      urlCount: sitemapUrlCount,
      sitemapUrl: detectedSitemapUrl,
    },
    headings: {
      h1,
      h2,
      h3,
      h4ToH6Count,
      emptyHeadingsCount,
      duplicateHeadings,
      hierarchyIssues,
    },
    images,
    issues,
    technicalChecks,
    onPageItems,
    contentIntelligence,
    internalLinking,
    structuredData,
    performance,
    technologies,
    crawledPages,
    rawHtmlExcerpt: mainFetch.html.slice(0, 15000),
  };
}

export function applySafeHtmlFixes(
  rawHtml: string,
  approvedFixIds: string[],
  audit: WebsiteAuditResult
): { updatedHtml: string; appliedChanges: { id: string; description: string }[] } {
  const $ = cheerio.load(rawHtml);
  const appliedChanges: { id: string; description: string }[] = [];

  if ($('head').length === 0) {
    $('html').prepend('<head></head>');
  }

  for (const issue of audit.issues) {
    const fix = issue.proposedFix;
    if (!fix || !approvedFixIds.includes(fix.id)) continue;

    if (fix.field === 'title') {
      const match = fix.proposedCode.match(/<title>([\s\S]*?)<\/title>/i);
      const newTitle = match ? match[1] : `${audit.contentIntelligence.primaryTopic}`;
      if ($('head > title').length > 0) {
        $('head > title').first().text(newTitle);
      } else {
        $('head').prepend(`<title>${newTitle}</title>\n`);
      }
      appliedChanges.push({ id: fix.id, description: `Updated <title> to "${newTitle}"` });
    } else if (fix.field === 'meta_description') {
      const match = fix.proposedCode.match(/content="([^"]*)"/i);
      const newDesc = match ? match[1] : '';
      if ($('meta[name="description"]').length > 0) {
        $('meta[name="description"]').attr('content', newDesc);
      } else {
        $('head').append(`\n  <meta name="description" content="${newDesc}" />`);
      }
      appliedChanges.push({ id: fix.id, description: 'Applied <meta name="description"> in <head>' });
    } else if (fix.field === 'canonical') {
      if ($('link[rel="canonical"]').length === 0) {
        $('head').append(`\n  <link rel="canonical" href="${audit.finalUrl}" />`);
        appliedChanges.push({ id: fix.id, description: `Added self-referencing canonical (${audit.finalUrl})` });
      }
    } else if (fix.field === 'viewport') {
      if ($('meta[name="viewport"]').length === 0) {
        $('head').prepend('\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />');
        appliedChanges.push({ id: fix.id, description: 'Added responsive <meta name="viewport"> tag' });
      }
    } else if (fix.field === 'html_lang') {
      if (!$('html').attr('lang')) {
        $('html').attr('lang', 'en');
        appliedChanges.push({ id: fix.id, description: 'Added lang="en" attribute to <html>' });
      }
    } else if (fix.field === 'image_alt') {
      let count = 0;
      $('img').each((_, el) => {
        const alt = $(el).attr('alt');
        if (alt === undefined || alt === null || alt.trim() === '') {
          $(el).attr('alt', `${audit.contentIntelligence.primaryTopic} image`);
          count++;
        }
      });
      if (count > 0) {
        appliedChanges.push({ id: fix.id, description: `Populated fallback alt attributes on ${count} <img> element(s)` });
      }
    }
  }

  return {
    updatedHtml: $.html(),
    appliedChanges,
  };
}
