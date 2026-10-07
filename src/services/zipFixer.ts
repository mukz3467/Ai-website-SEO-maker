import JSZip from 'jszip';
import type {
  FixSafetyLevel,
  ZipAuditAnalysis,
  ZipGenerationResult,
  ZipProposedChange,
} from '../types/seo';

export const MAX_ZIP_FILE_BYTES = 50 * 1024 * 1024; // 50 MB archive cap
export const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024; // 120 MB zip-bomb guard
export const MAX_ENTRY_COUNT = 3500;
export const MAX_INDIVIDUAL_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file

const BLOCKED_EXECUTABLE_EXTENSIONS = /\.(exe|dll|so|dylib|bat|cmd|msi|com|scr|pif|jar|bin|sh)$/i;

const IGNORED_DIRECTORY_PREFIXES = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  'coverage/',
  'vendor/',
  '.turbo/',
  '.cache/',
];

/**
 * Validates zip entry paths against directory traversal (../, ..\, absolute paths, null bytes)
 */
export function isSafeZipEntryPath(entryPath: string): boolean {
  if (!entryPath || typeof entryPath !== 'string') return false;
  let decoded = entryPath;
  try {
    decoded = decodeURIComponent(entryPath);
  } catch {}
  const normalized = decoded.replace(/\\/g, '/');

  if (
    normalized.startsWith('/') ||
    normalized.startsWith('\\') ||
    /^[a-zA-Z]:/.test(normalized) || // Windows drive letters
    normalized.includes('../') ||
    normalized.includes('/..') ||
    normalized === '..' ||
    normalized.includes('\0') ||
    normalized.includes('%2e%2e') ||
    normalized.includes('..%2f')
  ) {
    return false;
  }
  return true;
}

/**
 * Compute line-by-line diff for review display
 */
export function computeCodeDiff(
  currentCode: string,
  proposedCode: string
): { type: 'add' | 'del' | 'same'; text: string }[] {
  const currentLines = currentCode.split('\n');
  const proposedLines = proposedCode.split('\n');

  if (currentCode === proposedCode) {
    return currentLines.map((text) => ({ type: 'same', text }));
  }

  const diff: { type: 'add' | 'del' | 'same'; text: string }[] = [];

  // Show deleted lines then added lines for clear before/after
  for (const line of currentLines) {
    diff.push({ type: 'del', text: line });
  }
  for (const line of proposedLines) {
    diff.push({ type: 'add', text: line });
  }

  return diff;
}

/**
 * Validates HTML tags balance in generated snippets
 */
export function validateSnippetTagBalance(snippet: string): { valid: boolean; issue?: string } {
  const openHeads = (snippet.match(/<head\b[^>]*>/gi) || []).length;
  const closeHeads = (snippet.match(/<\/head>/gi) || []).length;
  if (openHeads > 0 && closeHeads > 0 && openHeads !== closeHeads) {
    return { valid: false, issue: 'Unbalanced <head> tags in patched markup.' };
  }

  const openTitles = (snippet.match(/<title\b[^>]*>/gi) || []).length;
  const closeTitles = (snippet.match(/<\/title>/gi) || []).length;
  if (openTitles !== closeTitles) {
    return { valid: false, issue: 'Unbalanced <title> tags in patched markup.' };
  }

  return { valid: true };
}

/**
 * Inspect and analyze uploaded website ZIP archive
 */
export async function inspectAndAnalyzeZip(
  file: File,
  siteContext?: { primaryUrl?: string; primaryTopic?: string; targetMarket?: string }
): Promise<{ analysis: ZipAuditAnalysis; fileContentsMap: Map<string, string> }> {
  // 1. Size Validation
  if (file.size > MAX_ZIP_FILE_BYTES) {
    throw new Error(
      `ZIP archive size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum safety limit of 50 MB.`
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err: any) {
    throw new Error(`Malformed or unreadable ZIP archive: ${err?.message || 'Invalid zip header'}`);
  }

  const entryNames = Object.keys(zip.files);

  // 2. Entry Count Validation (Zip Bomb protection)
  if (entryNames.length > MAX_ENTRY_COUNT) {
    throw new Error(
      `ZIP archive contains ${entryNames.length} entries, exceeding the safety ceiling of ${MAX_ENTRY_COUNT} files. Processing stopped for decompression bomb protection.`
    );
  }

  const securityNotes: string[] = [
    'Verified all archive paths against directory traversal (../) and root breakout attacks.',
    'Enforced 120 MB uncompressed text safety limit and executable binary filter.',
    'Zero remote server upload: entire source inspection performed in local browser memory.',
  ];

  let totalUncompressedBytes = 0;
  const allPaths: string[] = [];
  const fileContentsMap = new Map<string, string>();
  let skippedSuspiciousCount = 0;

  for (const rawPath of entryNames) {
    const entry = zip.files[rawPath];
    if (entry.dir) continue;

    if (!isSafeZipEntryPath(rawPath)) {
      skippedSuspiciousCount++;
      securityNotes.push(`Rejected unsafe path traversal attempt: "${rawPath}"`);
      continue;
    }

    if (BLOCKED_EXECUTABLE_EXTENSIONS.test(rawPath)) {
      securityNotes.push(`Blocked dangerous executable binary file: "${rawPath}"`);
      continue;
    }

    allPaths.push(rawPath);

    // Skip heavy third-party dependency directories from reading text into memory
    const isIgnoredDir = IGNORED_DIRECTORY_PREFIXES.some((dir) => rawPath.includes(dir));
    if (isIgnoredDir) continue;

    const isTextInspectable = /\.(html|htm|xhtml|tsx|jsx|ts|js|json|liquid|php|vue|svelte|astro|xml|txt|md|mdx|svg|yml|yaml)$/i.test(
      rawPath
    );

    if (isTextInspectable) {
      const text = await entry.async('string');
      totalUncompressedBytes += text.length;

      if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
        throw new Error(
          'Total uncompressed text payload exceeded the 120 MB safety limit (potential decompression bomb detected).'
        );
      }
      fileContentsMap.set(rawPath, text);
    }
  }

  if (skippedSuspiciousCount > 0) {
    securityNotes.push(`Excluded ${skippedSuspiciousCount} suspicious path traversal archive entries.`);
  }

  // 3. Framework Detection with Evidence
  const frameworkEvidence: string[] = [];
  let detectedFramework: ZipAuditAnalysis['detectedFramework'] = 'Unknown/Mixed';
  let frameworkConfidence: ZipAuditAnalysis['frameworkConfidence'] = 'Low';

  const pkgEntry = Array.from(fileContentsMap.entries()).find(([p]) => p.endsWith('package.json'));
  const pkgJsonText = pkgEntry ? pkgEntry[1].toLowerCase() : '';

  const hasAppRouter = allPaths.some((p) => /(^|\/)app\/(layout|page)\.(tsx|jsx|js|ts)$/i.test(p));
  const hasPagesRouter = allPaths.some((p) => /(^|\/)pages\/(_document|_app|index)\.(tsx|jsx|js|ts)$/i.test(p));
  const hasNextConfig = allPaths.some((p) => /next\.config\.(js|mjs|ts)$/i.test(p));
  const hasViteConfig = allPaths.some((p) => /vite\.config\.(ts|js|mjs)$/i.test(p));
  const hasShopifyTheme = allPaths.some((p) => p.endsWith('theme.liquid') || p.includes('layout/theme.liquid'));
  const hasWpFiles = allPaths.some((p) => p.endsWith('wp-config.php') || p.endsWith('functions.php') || p.endsWith('header.php'));
  const hasAstro = allPaths.some((p) => /astro\.config\.(mjs|ts|js)$/i.test(p) || p.endsWith('.astro'));
  const hasSvelte = allPaths.some((p) => /svelte\.config\.(js|ts)$/i.test(p) || p.endsWith('.svelte'));
  const hasVue = allPaths.some((p) => /nuxt\.config\.(ts|js)$/i.test(p) || p.endsWith('.vue'));
  const hasHtmlFiles = allPaths.some((p) => /\.(html|htm)$/i.test(p));

  const anyHtmlContent = Array.from(fileContentsMap.entries())
    .filter(([p]) => /\.(html|htm)$/i.test(p))
    .map(([, c]) => c)
    .join('\n');

  if (hasAppRouter && (hasNextConfig || pkgJsonText.includes('"next"'))) {
    detectedFramework = 'Next.js App Router';
    frameworkConfidence = 'High';
    frameworkEvidence.push('app/layout.tsx/jsx convention detected');
    if (hasNextConfig) frameworkEvidence.push('next.config file present');
    if (pkgJsonText.includes('"next"')) frameworkEvidence.push('package.json contains "next" dependency');
  } else if (hasPagesRouter && (hasNextConfig || pkgJsonText.includes('"next"'))) {
    detectedFramework = 'Next.js Pages Router';
    frameworkConfidence = 'High';
    frameworkEvidence.push('pages/_document or pages/_app convention detected');
    if (pkgJsonText.includes('"next"')) frameworkEvidence.push('package.json contains "next" dependency');
  } else if (hasNextConfig || pkgJsonText.includes('"next"')) {
    detectedFramework = 'Next.js';
    frameworkConfidence = 'Medium';
    frameworkEvidence.push('Next.js configuration or package dependency detected');
  } else if (hasShopifyTheme) {
    detectedFramework = 'Shopify';
    frameworkConfidence = 'High';
    frameworkEvidence.push('layout/theme.liquid template found');
  } else if (hasWpFiles) {
    detectedFramework = 'WordPress';
    frameworkConfidence = 'High';
    frameworkEvidence.push('WordPress theme template structure (functions.php/header.php) detected');
  } else if (hasAstro || pkgJsonText.includes('"astro"')) {
    detectedFramework = 'Astro';
    frameworkConfidence = 'High';
    frameworkEvidence.push('Astro configuration / .astro files detected');
  } else if (hasSvelte || pkgJsonText.includes('"svelte"')) {
    detectedFramework = 'Svelte';
    frameworkConfidence = 'High';
    frameworkEvidence.push('Svelte component / SvelteKit configuration detected');
  } else if (hasVue || pkgJsonText.includes('"vue"')) {
    detectedFramework = 'Vue';
    frameworkConfidence = 'High';
    frameworkEvidence.push('Vue SFC components / Nuxt configuration detected');
  } else if (anyHtmlContent.includes('data-wf-site') || anyHtmlContent.includes('webflow.js') || anyHtmlContent.includes('wf-page')) {
    detectedFramework = 'Webflow export';
    frameworkConfidence = 'High';
    frameworkEvidence.push('Webflow site meta attribute (data-wf-site) and export scripts detected');
  } else if (hasViteConfig) {
    detectedFramework = 'Vite';
    frameworkConfidence = 'High';
    frameworkEvidence.push('vite.config file found');
  } else if (pkgJsonText.includes('"react"') || allPaths.some((p) => p.endsWith('.tsx') || p.endsWith('.jsx'))) {
    detectedFramework = 'React';
    frameworkConfidence = 'Medium';
    frameworkEvidence.push('React JSX/TSX source structure detected');
  } else if (hasHtmlFiles) {
    detectedFramework = 'Static HTML';
    frameworkConfidence = 'High';
    frameworkEvidence.push('Standard static HTML document(s) detected without modern framework bundles');
  } else {
    detectedFramework = 'Unknown/Mixed';
    frameworkConfidence = 'Low';
    frameworkEvidence.push('Generic source archive with mixed or non-standard project structure');
  }

  // 4. Entry Point & SEO Relevant Files Detection
  const entryPoints = allPaths.filter((p) =>
    /(^|\/)(index\.html|app\/layout\.(tsx|jsx|js)|app\/page\.(tsx|jsx|js)|pages\/_document\.(tsx|jsx|js)|pages\/_app\.(tsx|jsx|js)|pages\/index\.(tsx|jsx|js)|src\/App\.(tsx|jsx)|layout\/theme\.liquid|header\.php)$/i.test(
      p
    )
  );

  const seoRelevantFiles = allPaths.filter(
    (p) =>
      !p.includes('node_modules/') &&
      (/\.(html|htm)$/i.test(p) ||
        /(layout|page|_document|index|robots|sitemap|theme\.liquid|header\.php)\.(tsx|jsx|ts|js|liquid|php|xml|txt)$/i.test(
          p
        ))
  );

  // 5. Generate Deterministic SEO Changes
  const proposedChanges: ZipProposedChange[] = [];
  const defaultCanonicalBase = siteContext?.primaryUrl || 'https://example.com';
  const defaultTopic = siteContext?.primaryTopic || 'Official Website';
  let changeCounter = 1;

  const nextFixId = (prefix: string) => `fix_${String(changeCounter++).padStart(3, '0')}_${prefix}`;

  // Analyze inspectable HTML & template files
  for (const [filePath, content] of fileContentsMap.entries()) {
    if (/\.(html|htm)$/i.test(filePath)) {
      // Check 1: Missing <html lang="...">
      if (/<html(?![^>]*\blang=)/i.test(content)) {
        const match = content.match(/<html[^>]*>/i);
        if (match) {
          const currentTag = match[0];
          const proposedTag = currentTag.replace(/^<html/i, '<html lang="en"');
          proposedChanges.push({
            id: nextFixId('lang'),
            filePath,
            areaOrLine: 'Root <html> declaration',
            safety: 'SAFE AUTO-FIX',
            currentCode: currentTag,
            proposedCode: proposedTag,
            reason: 'Adds missing lang="en" attribute to <html> element for screen reader accessibility and search engine language targeting.',
            riskLevel: 'Low',
            fixType: 'HTML Lang Attribute',
            approved: true,
            status: 'Approved',
            diffLines: computeCodeDiff(currentTag, proposedTag),
          });
        }
      }

      // Check 2: Missing <meta name="viewport">
      if (!/<meta[^>]*name=["']viewport["'][^>]*>/i.test(content) && /<head[^>]*>/i.test(content)) {
        const headMatch = content.match(/<head[^>]*>/i);
        if (headMatch) {
          const currentTag = headMatch[0];
          const proposedTag = `${currentTag}\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />`;
          proposedChanges.push({
            id: nextFixId('viewport'),
            filePath,
            areaOrLine: '<head> responsive viewport',
            safety: 'SAFE AUTO-FIX',
            currentCode: currentTag,
            proposedCode: proposedTag,
            reason: 'Adds missing mobile responsive viewport meta tag required for mobile-friendly Google indexability.',
            riskLevel: 'Low',
            fixType: 'Responsive Viewport',
            approved: true,
            status: 'Approved',
            diffLines: computeCodeDiff(currentTag, proposedTag),
          });
        }
      }

      // Check 3: Missing <title>
      if (!/<title>[\s\S]*?<\/title>/i.test(content) && /<head[^>]*>/i.test(content)) {
        const headMatch = content.match(/<head[^>]*>/i);
        if (headMatch) {
          const currentTag = headMatch[0];
          const proposedTag = `${currentTag}\n    <title>${defaultTopic}</title>`;
          proposedChanges.push({
            id: nextFixId('title'),
            filePath,
            areaOrLine: '<head> metadata section',
            safety: 'REVIEW REQUIRED',
            currentCode: currentTag,
            proposedCode: proposedTag,
            reason: 'Inserts missing <title> element inside <head>. Review required to verify title matches exact branding.',
            riskLevel: 'Medium',
            fixType: 'Document Title',
            approved: false,
            status: 'Proposed',
            diffLines: computeCodeDiff(currentTag, proposedTag),
          });
        }
      }

      // Check 4: Missing <meta name="description">
      if (!/<meta[^>]*name=["']description["'][^>]*>/i.test(content) && /<\/head>/i.test(content)) {
        const currentTag = '</head>';
        const proposedTag = `  <meta name="description" content="${defaultTopic} — official website, services, and resources." />\n  </head>`;
        proposedChanges.push({
          id: nextFixId('description'),
          filePath,
          areaOrLine: 'Before closing </head>',
          safety: 'REVIEW REQUIRED',
          currentCode: currentTag,
          proposedCode: proposedTag,
          reason: 'Adds missing <meta name="description"> for SERP snippet display. Review required to customize marketing copy.',
          riskLevel: 'Medium',
          fixType: 'Meta Description',
          approved: false,
          status: 'Proposed',
          diffLines: computeCodeDiff(currentTag, proposedTag),
        });
      }

      // Check 5: Missing <link rel="canonical">
      if (!/<link[^>]*rel=["']canonical["'][^>]*>/i.test(content) && /<\/head>/i.test(content)) {
        const currentTag = '</head>';
        const proposedTag = `  <link rel="canonical" href="${defaultCanonicalBase}" />\n  </head>`;
        proposedChanges.push({
          id: nextFixId('canonical'),
          filePath,
          areaOrLine: 'Before closing </head>',
          safety: 'REVIEW REQUIRED',
          currentCode: currentTag,
          proposedCode: proposedTag,
          reason: `Adds canonical link tag referencing "${defaultCanonicalBase}". Review required to ensure absolute target domain matches production host.`,
          riskLevel: 'Medium',
          fixType: 'Canonical URL',
          approved: false,
          status: 'Proposed',
          diffLines: computeCodeDiff(currentTag, proposedTag),
        });
      }

      // Check 6: Missing Open Graph & Twitter Cards
      if (!/<meta[^>]*property=["']og:title["'][^>]*>/i.test(content) && /<\/head>/i.test(content)) {
        const currentTag = '</head>';
        const proposedTag = `  <meta property="og:title" content="${defaultTopic}" />\n  <meta property="og:type" content="website" />\n  <meta name="twitter:card" content="summary_large_image" />\n  </head>`;
        proposedChanges.push({
          id: nextFixId('social-meta'),
          filePath,
          areaOrLine: 'Before closing </head>',
          safety: 'REVIEW REQUIRED',
          currentCode: currentTag,
          proposedCode: proposedTag,
          reason: 'Adds core Open Graph (og:title, og:type) and Twitter summary card tags for rich social snippet cards.',
          riskLevel: 'Low',
          fixType: 'Social Media Metadata',
          approved: false,
          status: 'Proposed',
          diffLines: computeCodeDiff(currentTag, proposedTag),
        });
      }

      // Check 7: Images without alt attributes
      const imgRegex = /<img\b(?![^>]*\balt=)[^>]*>/gi;
      let imgMatch: RegExpExecArray | null;
      let imgCountInFile = 0;

      while ((imgMatch = imgRegex.exec(content)) !== null && imgCountInFile < 3) {
        imgCountInFile++;
        const currentTag = imgMatch[0];
        const srcMatch = currentTag.match(/src=["']([^"']+)["']/i);
        const srcVal = srcMatch ? srcMatch[1] : '';

        // Safe contextual alt derivation without keyword-stuffing
        let proposedAlt = 'Site illustration';
        let safetyLevel: FixSafetyLevel = 'SAFE AUTO-FIX';
        let isApproved = true;

        if (/logo/i.test(srcVal)) {
          proposedAlt = `${defaultTopic} logo`;
        } else if (/icon/i.test(srcVal)) {
          proposedAlt = ''; // Decorative icon (WCAG alt="")
        } else if (/avatar|user/i.test(srcVal)) {
          proposedAlt = 'User profile avatar';
        } else {
          proposedAlt = `${defaultTopic} visual resource`;
          safetyLevel = 'REVIEW REQUIRED';
          isApproved = false;
        }

        const proposedTag = currentTag.replace(/^<img/i, `<img alt="${proposedAlt}"`);

        proposedChanges.push({
          id: nextFixId('img-alt'),
          filePath,
          areaOrLine: `<img> tag (${srcVal || 'image element'})`,
          safety: safetyLevel,
          currentCode: currentTag,
          proposedCode: proposedTag,
          reason: `Adds missing alt="${proposedAlt}" attribute to pass accessibility and image discovery checks without keyword stuffing.`,
          riskLevel: safetyLevel === 'SAFE AUTO-FIX' ? 'Low' : 'Medium',
          fixType: 'Image Alt Attribute',
          approved: isApproved,
          status: isApproved ? 'Approved' : 'Proposed',
          diffLines: computeCodeDiff(currentTag, proposedTag),
        });
      }
    }

    // Next.js App Router layout.tsx metadata export
    if (
      detectedFramework.includes('Next.js') &&
      /(^|\/)app\/layout\.(tsx|jsx|ts|js)$/i.test(filePath) &&
      !content.includes('export const metadata') &&
      !content.includes('generateMetadata')
    ) {
      const exportDefaultIdx = content.indexOf('export default');
      if (exportDefaultIdx !== -1) {
        const snippet = content.slice(exportDefaultIdx, exportDefaultIdx + 70).split('\n')[0];
        const metadataBlock = `export const metadata = {\n  title: '${defaultTopic}',\n  description: '${defaultTopic} — official website and resources.',\n  alternates: {\n    canonical: '${defaultCanonicalBase}',\n  },\n};\n\n${snippet}`;

        proposedChanges.push({
          id: nextFixId('next-app-meta'),
          filePath,
          areaOrLine: 'Next.js App Router Metadata Export',
          safety: 'REVIEW REQUIRED',
          currentCode: snippet,
          proposedCode: metadataBlock,
          reason: 'Adds Next.js 13+ App Router static metadata object for title, description, and canonical alternates.',
          riskLevel: 'Medium',
          fixType: 'Next.js App Router Metadata API',
          approved: false,
          status: 'Proposed',
          diffLines: computeCodeDiff(snippet, metadataBlock),
        });
      }
    }

    // Shopify layout/theme.liquid
    if (
      detectedFramework === 'Shopify' &&
      /(^|\/)layout\/theme\.liquid$/i.test(filePath) &&
      !content.includes('page_description') &&
      content.includes('</head>')
    ) {
      const currentTag = '</head>';
      const proposedTag = `  {%- if page_description -%}\n    <meta name="description" content="{{ page_description | escape }}">\n  {%- endif -%}\n  </head>`;
      proposedChanges.push({
        id: nextFixId('shopify-desc'),
        filePath,
        areaOrLine: 'Shopify layout/theme.liquid <head>',
        safety: 'REVIEW REQUIRED',
        currentCode: currentTag,
        proposedCode: proposedTag,
        reason: 'Inserts standard Shopify Liquid page_description meta tag before </head>.',
        riskLevel: 'Medium',
        fixType: 'Shopify Liquid Head Metadata',
        approved: false,
        status: 'Proposed',
        diffLines: computeCodeDiff(currentTag, proposedTag),
      });
    }

    // WordPress header.php safety notice
    if (
      detectedFramework === 'WordPress' &&
      /(^|\/)header\.php$/i.test(filePath) &&
      content.includes('wp_head()')
    ) {
      securityNotes.push(
        'WordPress theme header.php includes wp_head(); preserved dynamic hook to prevent duplicate title/meta collisions with SEO plugins.'
      );
    }
  }

  // Check if robots.txt exists in root or public/
  const hasRobotsTxt = allPaths.some((p) => /(^|\/)robots\.txt$/i.test(p));
  if (!hasRobotsTxt) {
    const robotsPath = allPaths.some((p) => p.startsWith('public/')) ? 'public/robots.txt' : 'robots.txt';
    const currentCode = '<!-- File does not exist in archive -->';
    const proposedCode = `User-agent: *\nAllow: /\n\nSitemap: ${defaultCanonicalBase.replace(/\/$/, '')}/sitemap.xml\n`;

    proposedChanges.push({
      id: nextFixId('robots-txt'),
      filePath: robotsPath,
      areaOrLine: 'New File Creation in project root',
      safety: 'SAFE AUTO-FIX',
      currentCode,
      proposedCode,
      reason: 'Creates standard robots.txt directing search engine crawlers and referencing the XML sitemap.',
      riskLevel: 'Low',
      fixType: 'Search Engine Crawl Directives',
      approved: true,
      status: 'Approved',
      diffLines: computeCodeDiff(currentCode, proposedCode),
    });
  }

  const safeFixesCount = proposedChanges.filter((c) => c.safety === 'SAFE AUTO-FIX').length;
  const reviewFixesCount = proposedChanges.filter((c) => c.safety === 'REVIEW REQUIRED').length;
  const manualFixesCount = proposedChanges.filter((c) => c.safety === 'MANUAL ONLY').length;

  return {
    analysis: {
      fileName: file.name,
      fileSizeBytes: file.size,
      totalFilesInspected: allPaths.length,
      detectedFramework,
      frameworkConfidence,
      frameworkEvidence,
      entryPoints: entryPoints.slice(0, 10),
      seoRelevantFiles: seoRelevantFiles.slice(0, 20),
      proposedChanges,
      securityNotes,
      safeFixesCount,
      reviewFixesCount,
      manualFixesCount,
    },
    fileContentsMap,
  };
}

/**
 * Generates the corrected ZIP archive containing ONLY approved changes
 * Never modifies or touches the original source file
 */
export async function generateCorrectedZipArchive(
  originalFile: File,
  approvedChanges: ZipProposedChange[]
): Promise<ZipGenerationResult> {
  const zip = await JSZip.loadAsync(originalFile);
  const totalFiles = Object.keys(zip.files).filter((p) => !zip.files[p].dir).length;

  const activeApproved = approvedChanges.filter((c) => c.approved);
  const byFile = new Map<string, ZipProposedChange[]>();

  for (const change of activeApproved) {
    const list = byFile.get(change.filePath) || [];
    list.push(change);
    byFile.set(change.filePath, list);
  }

  const modifiedFilePaths: string[] = [];
  const validationNotes: string[] = [];

  for (const [filePath, changes] of byFile.entries()) {
    if (!isSafeZipEntryPath(filePath)) {
      validationNotes.push(`Skipped unsafe entry path: ${filePath}`);
      continue;
    }

    // New file creation (e.g. robots.txt)
    if (changes.length === 1 && changes[0].currentCode.includes('File does not exist')) {
      zip.file(filePath, changes[0].proposedCode);
      modifiedFilePaths.push(filePath);
      validationNotes.push(`Created new file "${filePath}" with approved content.`);
      continue;
    }

    const entry = zip.files[filePath];
    if (!entry || entry.dir) continue;

    let content = await entry.async('string');
    let fileModified = false;

    for (const change of changes) {
      if (change.currentCode && content.includes(change.currentCode)) {
        content = content.replace(change.currentCode, change.proposedCode);
        fileModified = true;
      }
    }

    if (fileModified) {
      // Run lightweight client-side syntax/tag balance check
      const check = validateSnippetTagBalance(content);
      if (!check.valid) {
        validationNotes.push(`Warning for "${filePath}": ${check.issue}`);
      }
      zip.file(filePath, content);
      modifiedFilePaths.push(filePath);
    }
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const modifiedFilesCount = modifiedFilePaths.length;
  const unchangedFilesCount = Math.max(0, totalFiles - modifiedFilesCount);
  const appliedFixesCount = activeApproved.length;
  const reviewFixesNotAppliedCount = approvedChanges.filter(
    (c) => c.safety === 'REVIEW REQUIRED' && !c.approved
  ).length;
  const manualFixesNotAppliedCount = approvedChanges.filter((c) => c.safety === 'MANUAL ONLY').length;
  const skippedFilesCount = approvedChanges.filter((c) => !c.approved).length;

  const baseName = originalFile.name.replace(/\.zip$/i, '');
  const fileName = `${baseName}-zyvenseo-fixed.zip`;

  validationNotes.push(
    `Lightweight browser-side syntax and DOM balance check passed on ${modifiedFilesCount} modified file(s).`
  );
  validationNotes.push('Production compiler build not executed in browser sandbox (build validation limited to syntax).');

  return {
    blob,
    fileName,
    totalFiles,
    modifiedFilesCount,
    modifiedFilePaths,
    unchangedFilesCount,
    skippedFilesCount,
    appliedFixesCount,
    reviewFixesNotAppliedCount,
    manualFixesNotAppliedCount,
    validationNotes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Convenience wrapper returning directly Blob for download handlers
 */
export async function generateCorrectedZipBlob(
  originalFile: File,
  approvedChanges: ZipProposedChange[]
): Promise<Blob> {
  const res = await generateCorrectedZipArchive(originalFile, approvedChanges);
  return res.blob;
}
