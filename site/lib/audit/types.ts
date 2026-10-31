// The audit envelope mirrors claude-seo's `audit-data.json` shape so the
// numbers mean the same thing as the Claude Code plugin's report.
// Source of the weights: AgriciDaniel/claude-seo · skills/seo-audit/SKILL.md

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type CategoryKey =
  | "technical"
  | "content"
  | "onpage"
  | "schema"
  | "performance"
  | "ai"
  | "images";

export type CategoryMeta = {
  key: CategoryKey;
  label: string;
  weight: number;
  blurb: string;
};

export const CATEGORIES: CategoryMeta[] = [
  {
    key: "technical",
    label: "Technical SEO",
    weight: 0.22,
    blurb: "Crawlability, indexing, canonicals, robots.txt, sitemaps.",
  },
  {
    key: "content",
    label: "Content Quality",
    weight: 0.23,
    blurb: "E-E-A-T, thin content, depth, readability, citations.",
  },
  {
    key: "onpage",
    label: "On-Page SEO",
    weight: 0.2,
    blurb: "Titles, descriptions, headings, internal links, social tags.",
  },
  {
    key: "schema",
    label: "Schema / Structured Data",
    weight: 0.1,
    blurb: "JSON-LD detection, validity and required properties.",
  },
  {
    key: "performance",
    label: "Performance (estimated)",
    weight: 0.1,
    blurb: "Weight, blocking resources, image and script hygiene.",
  },
  {
    key: "ai",
    label: "AI Search Readiness",
    weight: 0.1,
    blurb: "GEO: AI crawler access, llms.txt, citability, agent readiness.",
  },
  {
    key: "images",
    label: "Images",
    weight: 0.05,
    blurb: "Alt coverage, modern formats, layout-shift safety.",
  },
];

export type Check = {
  id: string;
  category: CategoryKey;
  title: string;
  status: CheckStatus;
  severity: Severity;
  weight: number;
  /** What we actually saw, in the user's words. */
  evidence: string;
  /** Why it matters — shown when the finding is expanded. */
  why: string;
  /** The specific fix, like claude-seo's recommendation field. */
  fix: string;
};

export type CategoryResult = CategoryMeta & {
  score: number;
  passed: number;
  warnings: number;
  failed: number;
  checks: Check[];
};

export type ActionItem = {
  id: string;
  title: string;
  severity: Severity;
  category: CategoryKey;
  categoryLabel: string;
  fix: string;
  evidence: string;
};

export type PageSnapshot = {
  url: string;
  status: number;
  finalUrl: string;
  redirects: number;
  html: string;
  text: string;
  headers: Record<string, string>;
  ttfbMs: number;
  bytes: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  h1s: string[];
  headings: { level: number; text: string }[];
  images: { src: string; alt: string | null; loading: string | null; width: string | null; height: string | null }[];
  links: { href: string; text: string; internal: boolean }[];
  jsonLd: string[];
  scriptCount: number;
  stylesheetCount: number;
  inlineScriptBytes: number;
  wordCount: number;
  og: Record<string, string>;
  hasFaqMarkup: boolean;
  semanticTags: string[];
  sameAs: string[];
  dates: { published: string | null; modified: string | null };
  author: string | null;
};

export type SiteSnapshot = {
  requestedUrl: string;
  origin: string;
  homepage: PageSnapshot;
  robotsTxt: string | null;
  sitemapXml: string | null;
  llmsTxt: string | null;
  extraPages: { url: string; status: number; title: string | null; description: string | null }[];
  fetchedAt: string;
  demo: boolean;
  mode?: "server" | "browser";
  notes: string[];
};

export type Report = {
  url: string;
  finalUrl: string;
  hostname: string;
  title: string | null;
  description: string | null;
  score: number;
  grade: string;
  categories: CategoryResult[];
  actionPlan: { phase: string; timeframe: string; items: ActionItem[] }[];
  quickWins: ActionItem[];
  stats: {
    wordCount: number;
    images: number;
    missingAlt: number;
    internalLinks: number;
    externalLinks: number;
    headings: number;
    ttfbMs: number;
    pageKb: number;
    scripts: number;
    pagesScanned: number;
  };
  fetchedAt: string;
  demo: boolean;
  /** Optional site screenshot (browser-mode audits attach one). */
  screenshot?: string | null;
  notes: string[];
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
