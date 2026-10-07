export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASSED';

export type FixSafetyLevel = 'SAFE AUTO-FIX' | 'REVIEW REQUIRED' | 'MANUAL ONLY';

export type DataSourceType =
  | 'OBSERVED_WEBSITE_DATA'
  | 'GOOGLE_SEARCH_CONSOLE'
  | 'AI_GENERATED_RECOMMENDATION'
  | 'NOT_MEASURED';

export type TaskStatus = 'Pending' | 'In Review' | 'Approved' | 'Applied' | 'Verified';

export type TargetMarket =
  | 'Global'
  | 'United States'
  | 'United Kingdom'
  | 'Canada'
  | 'Australia'
  | 'Pakistan'
  | 'India'
  | 'Custom';

export type PrimaryGoal =
  | 'Increase Organic Traffic'
  | 'Improve Rankings'
  | 'Generate Leads'
  | 'Increase Sales'
  | 'Improve Local Visibility'
  | 'Improve Technical SEO'
  | 'Improve Content Strategy';

export type AuditStage =
  | 'Preparing URL'
  | 'Connecting to website'
  | 'Fetching page'
  | 'Analyzing technical SEO'
  | 'Analyzing metadata'
  | 'Analyzing content'
  | 'Checking links'
  | 'Checking structured data'
  | 'Checking indexability'
  | 'Building SEO report'
  | 'Generating recommendations';

export interface ProposedHtmlFix {
  id: string;
  field: 'title' | 'meta_description' | 'viewport' | 'html_lang' | 'canonical' | 'image_alt' | 'open_graph';
  label: string;
  safety: FixSafetyLevel;
  currentCode: string;
  proposedCode: string;
  reason: string;
}

export interface SEOIssue {
  id: string;
  category:
    | 'Technical'
    | 'On-Page'
    | 'Content'
    | 'Indexability'
    | 'Structured Data'
    | 'Internal Linking'
    | 'Performance'
    | 'Metadata';
  severity: SeverityLevel;
  title: string;
  description: string;
  evidence: string;
  whyItMatters: string;
  recommendation: string;
  recommendedFix: string; // alias for recommendation for backwards-compatibility
  affectedUrl: string;
  difficulty: 'Low' | 'Medium' | 'High';
  impactCategory: 'High' | 'Medium' | 'Low';
  safetyClassification: FixSafetyLevel;
  autoFixable: boolean;
  requiresReview: boolean;
  dataSource: DataSourceType;
  fixPrompt: string;
  proposedFix?: ProposedHtmlFix;
  taskStatus: TaskStatus;
}

export interface TechnicalCheckItem {
  id: string;
  name: string;
  group:
    | 'Protocol & Security'
    | 'Indexability & Crawlability'
    | 'Metadata & Head'
    | 'Document & Headings'
    | 'Links & Media'
    | 'Social & Structured Data';
  status: SeverityLevel | 'NOT_MEASURED';
  observedValue: string;
  explanation: string;
  recommendation?: string;
  dataSource: DataSourceType;
}

export interface OnPageItem {
  id: string;
  element: string;
  status: SeverityLevel | 'NOT_MEASURED';
  currentState: string;
  problem: string;
  whyItMatters: string;
  recommendedChange: string;
  suggestedImplementation: string;
}

export interface SupportingArticlePlan {
  title: string;
  intent: 'Informational' | 'Commercial' | 'Transactional' | 'Navigational';
  suggestedInternalLinkFrom: string;
  suggestedAnchorText: string;
  rationale: string;
}

export interface ContentIntelligenceData {
  primaryTopic: string;
  secondaryTopics: string[];
  probableSearchIntent: 'Informational' | 'Commercial' | 'Transactional' | 'Navigational' | 'Mixed';
  wordCount: number;
  characterCount: number;
  sentenceCount: number;
  paragraphCount: number;
  textToHtmlRatioPercent: number;
  contentDepthAssessment: 'Very thin content' | 'Potentially low-content page' | 'Reasonably substantial content';
  isJavaScriptRenderedLikely: boolean;
  jsRenderNotice?: string;
  readabilitySummary: string;
  topObservedTerms: { term: string; count: number; densityPercent: number }[];
  contentGaps: string[];
  topicalAuthorityOpportunities: string[];
  missingSupportingPages: string[];
  intentOpportunities: {
    informational: string[];
    commercial: string[];
    transactional: string[];
    navigational: string[];
  };
  topicCluster: {
    pillarPage: string;
    pillarTargetUrl: string;
    supportingArticles: SupportingArticlePlan[];
  };
  searchVolumeDisclaimer: string;
}

export interface ObservedLinkItem {
  href: string;
  anchorText: string;
  isInternal: boolean;
  rel: string;
  occurrences: number;
  statusNote: string;
}

export interface ExternalLinkItem {
  href: string;
  domain: string;
  anchorText: string;
  rel: string;
  occurrences: number;
  isNofollow: boolean;
  isSponsored: boolean;
  isUgc: boolean;
}

export interface InternalLinkRecommendation {
  sourcePage: string;
  targetPage: string;
  suggestedAnchor: string;
  reason: string;
}

export interface InternalLinkAnalysis {
  totalInternalLinks: number;
  totalExternalLinks: number;
  uniqueInternalTargets: number;
  uniqueExternalDomains: number;
  emptyAnchorCount: number;
  genericAnchorCount: number;
  emptyHrefCount: number;
  fragmentOnlyCount: number;
  nofollowInternalCount: number;
  topLinkedInternalPages: { url: string; count: number; sampleAnchor: string }[];
  lowLinkedInternalPages: { url: string; count: number; sampleAnchor: string }[];
  observedLinks: ObservedLinkItem[];
  externalLinks: ExternalLinkItem[];
  orphanDetectionNote: string;
  recommendations: InternalLinkRecommendation[];
}

export interface ImageAltAnalysis {
  totalImages: number;
  imagesWithAlt: number;
  imagesWithoutAlt: number;
  imagesWithEmptyAlt: number;
  coveragePercent: number;
  imagesWithoutLazyLoad: number;
  imagesWithoutDimensions: number;
  decorativeGuidance: string;
  sampleImages: {
    src: string;
    alt: string | null;
    hasAlt: boolean;
    isDecorativeCandidate: boolean;
  }[];
}

export interface StructuredDataItem {
  index: number;
  types: string[];
  valid: boolean;
  rawPreview: string;
  issues: string[];
}

export interface StructuredDataAudit {
  detectedScriptsCount: number;
  schemaTypes: string[];
  validCount: number;
  invalidCount: number;
  contentAlignmentNote: string;
  items: StructuredDataItem[];
  suggestedSchemaTypes: { type: string; reason: string }[];
}

export interface PerformanceSignalAudit {
  responseTimeMs: number;
  htmlSizeBytes: number;
  contentType: string;
  redirectCount: number;
  totalImages: number;
  imagesWithoutAlt: number;
  imagesWithoutLazyLoad: number;
  imagesWithoutDimensions: number;
  renderBlockingScripts: number;
  totalScripts: number;
  stylesheetCount: number;
  compressionHeader: string;
  cacheControlHeader: string;
  unmeasuredMetrics: { metric: string; reason: string }[];
  recommendations: {
    title: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    observedEvidence: string;
    action: string;
  }[];
}

export interface DetectedTechnology {
  name: string;
  category: 'Framework' | 'CMS / Commerce' | 'Hosting / CDN' | 'Analytics / Tag' | 'Rendering' | 'Styling';
  confidence: 'High' | 'Medium' | 'Low';
  evidence: string;
}

export interface CrawledPageSummary {
  url: string;
  statusCode: number;
  title: string;
  metaDescription: string;
  h1: string;
  canonical: string;
  wordCount: number;
  internalLinksCount: number;
  indexable: boolean;
}

export interface DiagnosticScores {
  overall: number;
  technicalIndexability: number;
  onPageHeadings: number;
  contentKeywords: number;
  mobilePerformance: number;
  socialStructuredData: number;
  formulaBreakdown: string;
  technical?: number;
  onPage?: number;
  content?: number;
  indexability?: number;
  structuredData?: number;
  performance?: number;
  label: string;
}

export interface OpenGraphAnalysis {
  tags: Record<string, string>;
  presentCount: number;
  missingRequired: string[];
  hasCoreTags: boolean;
}

export interface TwitterCardAnalysis {
  tags: Record<string, string>;
  presentCount: number;
  cardType?: string;
  missingCore: string[];
}

export interface WebsiteAuditResult {
  auditId: string;
  url: string;
  finalUrl: string;
  targetMarket: TargetMarket;
  customMarket?: string;
  primaryGoal: PrimaryGoal;
  auditDate: string;
  crawlMode: 'single' | 'multi';
  statusCode: number;
  contentType: string;
  redirectChain: { url: string; status: number }[];
  scores: DiagnosticScores;
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    passed: number;
  };
  metadata: {
    title: string;
    titleLength: number;
    titleStatus: 'Good' | 'Needs Improvement' | 'Missing';
    metaDescription: string;
    metaDescriptionLength: number;
    metaDescriptionStatus: 'Good' | 'Needs Improvement' | 'Missing';
    canonical: string;
    canonicalStatus: 'Valid Self-Referencing' | 'Cross-URL / Mismatched' | 'Missing' | 'Malformed';
    multipleCanonical: boolean;
    robotsMeta: string;
    xRobotsTag: string;
    robotsDirectives: string[];
    indexabilityVerdict: 'Indexable' | 'Not Indexable' | 'Conditionally Indexable';
    indexabilityReason: string;
    indexabilitySignal: 'Allowed to crawl' | 'Blocked by robots.txt' | 'Noindex detected' | 'Not measurable';
    viewport: string;
    lang: string;
    charset: string;
    favicon: string;
    openGraph: OpenGraphAnalysis;
    twitterCard: TwitterCardAnalysis;
    hreflangTags: { lang: string; href: string }[];
    lastModifiedHeader: string;
  };
  robotsTxt: {
    checkedUrl: string;
    available: boolean;
    status: 'Exists' | 'Missing' | 'Unavailable' | 'Malformed';
    statusCode: number | null;
    blocksCurrentPath: boolean;
    relevantRules: string[];
    sitemapReferences: string[];
    preview: string;
  };
  sitemapXml: {
    checkedUrl: string;
    available: boolean;
    status: 'Found' | 'Missing' | 'Blocked' | 'Unavailable' | 'Sitemap detected' | 'Sitemap not detected' | 'Sitemap unavailable';
    format: 'XML sitemap' | 'Sitemap index' | 'HTML' | 'Unavailable';
    statusCode: number | null;
    urlCount: number | null;
    sitemapUrl?: string;
  };
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
    h4ToH6Count: number;
    emptyHeadingsCount: number;
    duplicateHeadings: string[];
    hierarchyIssues: string[];
  };
  images: ImageAltAnalysis;
  issues: SEOIssue[];
  technicalChecks: TechnicalCheckItem[];
  onPageItems: OnPageItem[];
  contentIntelligence: ContentIntelligenceData;
  internalLinking: InternalLinkAnalysis;
  structuredData: StructuredDataAudit;
  performance: PerformanceSignalAudit;
  technologies: DetectedTechnology[];
  crawledPages: CrawledPageSummary[];
  rawHtmlExcerpt: string;
}

export interface GSCProperty {
  siteUrl: string;
  displayName: string;
  type: 'Domain property' | 'URL-prefix property';
  permissionLevel: string;
}

export interface GSCQueryRow {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  country?: string;
  device?: string;
}

export interface GSCPageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
}

export interface GSCCountryRow {
  countryCode: string;
  countryName: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCDeviceRow {
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCDateTrendRow {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type GSCOpportunityType =
  | 'QUICK_WIN_POS_4_10'
  | 'STRIKING_DISTANCE_POS_11_20'
  | 'HIGH_IMPRESSION_LOW_CTR'
  | 'POTENTIAL_OVERLAP'
  | 'POSITION_21_30';

export interface GSCOpportunityItem {
  id: string;
  type: GSCOpportunityType;
  title: string;
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  opportunity: string;
  recommendedAction: string;
  pages?: string[];
}

export interface GSCSearchData {
  propertyUrl: string;
  propertyType: 'Domain property' | 'URL-prefix property';
  dateRange: { startDate: string; endDate: string; preset?: string };
  lastFetched: string;
  totals: {
    clicks: number;
    impressions: number;
    avgCtr: number;
    avgPosition: number;
  };
  rows: GSCQueryRow[];
  pages: GSCPageRow[];
  countries: GSCCountryRow[];
  devices: GSCDeviceRow[];
  dateTrends: GSCDateTrendRow[];
  opportunities: GSCOpportunityItem[];
  quickWins: GSCQueryRow[];
  lowCtrOpportunities: GSCQueryRow[];
  position1To3: GSCQueryRow[];
  position4To10: GSCQueryRow[];
  position5To10?: GSCQueryRow[];
  position11To20: GSCQueryRow[];
  position21To30: GSCQueryRow[];
  position31Plus: GSCQueryRow[];
  cannibalizationSignals: { query: string; pages: string[]; impressions: number }[];
}

export type GSCStatus =
  | 'Connected'
  | 'Not Connected'
  | 'Connecting...'
  | 'Permission Required'
  | 'Connection Error'
  | 'Data Unavailable';

export interface GSCConnectionState {
  status: GSCStatus;
  oauthConfigured: boolean;
  properties: GSCProperty[];
  selectedProperty?: string;
  message: string;
  data?: GSCSearchData;
  lastError?: string;
}

export interface AIPriorityFix {
  title: string;
  priority: 'P0 Critical' | 'P1 High' | 'P2 Medium' | 'P3 Low' | 'CRITICAL' | 'HIGH' | 'MEDIUM';
  category: string;
  evidence: string;
  whyItMatters: string;
  recommendedAction: string;
  difficulty: 'Low' | 'Medium' | 'High';
  expectedImpact: 'High' | 'Medium' | 'Low';
  autoFixable: boolean;
  requiresReview: boolean;
  rationale?: string;
  action?: string;
}

export interface AIBacklinkOpportunity {
  opportunityType: string;
  whyRelevant: string;
  recommendedApproach: string;
  contentAssetNeeded: string;
  priority: string;
}

export interface AIContentStrategy {
  primaryTopic: string;
  secondaryTopics: string[];
  topicClusters: {
    cluster: string;
    pillarPage: string;
    supportingContent: string[];
    searchIntent: string;
  }[];
  contentGaps: string[];
  keywordTopicCandidates: {
    topic: string;
    searchIntent: string;
    reason: string;
    recommendedPageType: string;
    priority: string;
  }[];
  pillarTopic?: string;
  clusterPlan?: string[];
  intentAlignment?: string;
}

export interface AIInternalLinkRec {
  sourcePage: string;
  targetPage: string;
  suggestedAnchorText: string;
  reason: string;
  priority: string;
}

export interface AIStructuredDataRec {
  schema: string;
  reason: string;
  targetPage: string;
}

export interface AIDigitalPrStrategy {
  angles: string[];
  dataStudyIdeas: string[];
  expertCommentaryTopics: string[];
}

export interface AIOutreachPlan {
  steps: string[];
  targetPersonas: string[];
  etiquetteGuidelines: string[];
}

export interface AIMeasurementPlan {
  thirtyDayGoals: string[];
  sixtyDayGoals: string[];
  ninetyDayGoals: string[];
  kpis: string[];
}

export interface AIGrowthStrategy {
  executiveSummary: string;
  searchIntelligenceReport: string;
  priorityFixes: AIPriorityFix[];
  technicalSeoFixes: string[];
  onPageFixes: string[];
  contentStrategy: AIContentStrategy;
  internalLinkingStrategy: string[];
  structuredDataStrategy: string[];
  performanceActions: string[];
  offPageStrategy: {
    digitalPr: string[];
    editorialBacklinks: string[];
    linkableAssets: string[];
    outreachPlan: string[];
  };
  backlinkOpportunities: AIBacklinkOpportunity[];
  digitalPrStrategy: AIDigitalPrStrategy;
  outreachPlan: AIOutreachPlan;
  measurementPlan: string[];
  safeAutoFixes: string[];
  manualReviewFixes: string[];
  doNotDo: string[];
  generatedBy: 'GEMINI_AI' | 'DETERMINISTIC_ENGINE';
  generatedAt: string;
}

export interface ZipProposedChange {
  id: string;
  filePath: string;
  areaOrLine: string;
  safety: FixSafetyLevel;
  currentCode: string;
  proposedCode: string;
  reason: string;
  riskLevel?: 'Low' | 'Medium' | 'High';
  fixType?: string;
  approved: boolean;
  status?: 'Proposed' | 'Approved' | 'Rejected' | 'Applied';
  diffLines?: { type: 'add' | 'del' | 'same'; text: string }[];
}

export interface ZipAuditAnalysis {
  fileName: string;
  fileSizeBytes: number;
  totalFilesInspected: number;
  detectedFramework:
    | 'Static HTML'
    | 'Next.js App Router'
    | 'Next.js Pages Router'
    | 'Next.js'
    | 'React'
    | 'Vite'
    | 'WordPress'
    | 'Shopify'
    | 'Webflow export'
    | 'Vue'
    | 'Svelte'
    | 'Astro'
    | 'Unknown/Mixed';
  frameworkConfidence: 'High' | 'Medium' | 'Low';
  frameworkEvidence: string[];
  entryPoints: string[];
  seoRelevantFiles: string[];
  proposedChanges: ZipProposedChange[];
  securityNotes: string[];
  safeFixesCount: number;
  reviewFixesCount: number;
  manualFixesCount: number;
}

export interface ZipGenerationResult {
  blob: Blob;
  fileName: string;
  totalFiles: number;
  modifiedFilesCount: number;
  modifiedFilePaths: string[];
  unchangedFilesCount: number;
  skippedFilesCount: number;
  appliedFixesCount: number;
  reviewFixesNotAppliedCount: number;
  manualFixesNotAppliedCount: number;
  validationNotes: string[];
  generatedAt: string;
}
