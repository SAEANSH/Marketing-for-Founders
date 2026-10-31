import type {
  ActionItem,
  CategoryKey,
  CategoryResult,
  Check,
  CheckStatus,
  Report,
  Severity,
  SiteSnapshot,
} from "./types";
import { CATEGORIES, SEVERITY_ORDER } from "./types";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 5,
  high: 3,
  medium: 2,
  low: 1,
  info: 1,
};

const STATUS_VALUE: Record<CheckStatus, number> = { pass: 1, warn: 0.6, fail: 0, info: 1 };

function mk(
  id: string,
  category: CategoryKey,
  title: string,
  status: CheckStatus,
  severity: Severity,
  evidence: string,
  why: string,
  fix: string,
): Check {
  return { id, category, title, status, severity, weight: SEVERITY_WEIGHT[severity], evidence, why, fix };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function stripComments(robots: string): string {
  return robots
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .join("\n");
}

function robotsBlocks(robots: string, bot: string): "blocked" | "allowed" | "unknown" {
  const lines = stripComments(robots).split("\n");
  let currentAgents: string[] = [];
  let state: "none" | "allow" | "disallow" = "none";

  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      currentAgents = [value.toLowerCase()];
      state = "none";
      continue;
    }
    if (key !== "allow" && key !== "disallow") continue;

    const matches = currentAgents.some((a) => a === "*" || a === bot.toLowerCase());
    if (!matches) continue;

    if (value === "/" || value === "") {
      if (value === "/" && key === "disallow") state = "disallow";
      if (value === "/" && key === "allow") state = "allow";
    }
  }
  if (state === "disallow") return "blocked";
  if (state === "allow") return "allowed";
  return "unknown";
}

function parseJsonLd(blocks: string[]): { nodes: any[]; invalid: number } {
  const nodes: any[] = [];
  let invalid = 0;
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block);
      if (Array.isArray(parsed)) nodes.push(...parsed);
      else if (parsed && typeof parsed === "object" && Array.isArray(parsed["@graph"])) nodes.push(...parsed["@graph"]);
      else nodes.push(parsed);
    } catch {
      invalid++;
    }
  }
  return { nodes: nodes.filter(Boolean), invalid };
}

function typeOf(node: any): string[] {
  if (!node || typeof node !== "object") return [];
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x) => typeof x === "string");
  return [];
}

function avgSentenceWords(text: string): number {
  const sentences = text.split(/[.!?]+\s/).filter((s) => s.trim().split(/\s+/).length > 3);
  if (sentences.length === 0) return 0;
  const words = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0);
  return Math.round(words / sentences.length);
}

function worst(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  return "pass";
}

/* ------------------------------------------------------------------ */
/* the checks                                                          */
/* ------------------------------------------------------------------ */

export function runChecks(site: SiteSnapshot): ReturnType<typeof buildReport> {
  const page = site.homepage;
  const robots = site.robotsTxt ?? "";
  const checks: Check[] = [];
  const { nodes: jsonLdNodes, invalid: invalidJsonLd } = parseJsonLd(page.jsonLd);
  const ldTypes = new Set(jsonLdNodes.flatMap(typeOf));

  /* ---------- Technical SEO (22%) ---------- */
  const isHttps = page.finalUrl.startsWith("https://");
  checks.push(
    mk("https", "technical", "HTTPS everywhere",
      isHttps ? "pass" : "fail", "critical",
      isHttps ? "Page served over HTTPS." : "Page served over plain HTTP.",
      "HTTPS is a confirmed ranking signal and browsers mark HTTP pages as “Not secure”.",
      "Install a TLS certificate (Let's Encrypt is free) and 301-redirect all HTTP traffic to HTTPS."),
  );

  checks.push(
    mk("redirects", "technical", "Redirect chain",
      page.redirects <= 1 ? "pass" : page.redirects === 2 ? "warn" : "fail",
      "medium",
      page.redirects === 0 ? "No redirects — the URL resolves directly." : `${page.redirects} redirect hop(s) before the page loaded.`,
      "Every hop costs crawl budget and latency, and leaks a little link equity.",
      "Point internal links and canonicals straight at the final URL, not the redirecting one."),
  );

  checks.push(
    mk("robots", "technical", "robots.txt present",
      site.robotsTxt ? (robotsBlocks(robots, "googlebot") === "blocked" ? "fail" : "pass") : "warn",
      site.robotsTxt ? "high" : "medium",
      site.robotsTxt ? `robots.txt found (${site.robotsTxt.length} bytes).` : "No robots.txt at the site root.",
      "robots.txt is the first file crawlers request; missing or over-restrictive rules hide the site.",
      site.robotsTxt
        ? "Keep the file short: allow crawling, then list the sitemap URL."
        : "Add /robots.txt with an `Allow: /` rule and a `Sitemap:` line."),
  );

  const sitemapUrls = site.sitemapXml ? (site.sitemapXml.match(/<loc>/g) ?? []).length : 0;
  checks.push(
    mk("sitemap", "technical", "XML sitemap",
      sitemapUrls > 5 ? "pass" : sitemapUrls > 0 ? "warn" : "fail",
      "high",
      site.sitemapXml ? `sitemap.xml found with ${sitemapUrls} URL(s).` : "No /sitemap.xml found.",
      "Sitemaps are how you tell search engines which URLs matter and when they changed.",
      "Generate /sitemap.xml (Next.js: next-sitemap or app/sitemap.ts) and reference it from robots.txt."),
  );

  checks.push(
    mk("canonical", "technical", "Canonical tag",
      page.canonical ? (page.canonical.includes(new URL(page.finalUrl).host) ? "pass" : "warn") : "fail",
      page.canonical ? "high" : "critical",
      page.canonical ? `rel=canonical → ${page.canonical}` : "No rel=canonical on the page.",
      "Without a canonical, Google guesses which URL is the original — splitting ranking signals.",
      "Add <link rel=\"canonical\" href=\"<absolute URL>\"> to every page, self-referencing."),
  );

  const noindex = (page.robotsMeta ?? "").toLowerCase();
  checks.push(
    mk("indexable", "technical", "Page is indexable",
      noindex.includes("noindex") ? "fail" : "pass", "critical",
      page.robotsMeta ? `meta robots = “${page.robotsMeta}”.` : "No meta robots directive — indexable by default.",
      "A stray noindex is the single most common cause of a page vanishing from Google.",
      "Remove `noindex` from the production meta robots tag; keep it only on staging."),
  );

  checks.push(
    mk("lang", "technical", "html lang attribute",
      page.lang ? "pass" : "warn", "low",
      page.lang ? `<html lang="${page.lang}">.` : "The <html> tag has no lang attribute.",
      "Language tells search engines and screen readers how to treat the page.",
      "Set <html lang=\"en\"> (or your locale)."),
  );

  checks.push(
    mk("viewport", "technical", "Mobile viewport",
      page.html.includes("name=\"viewport\"") || page.html.includes("name='viewport'") ? "pass" : "fail",
      "high",
      page.html.includes("viewport") ? "Viewport meta tag found." : "No viewport meta tag.",
      "Mobile-first indexing: without a viewport the page renders as a desktop zoom-out on phones.",
      "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">."),
  );

  const hsts = page.headers["strict-transport-security"];
  const browserMode = site.mode === "browser";
  checks.push(
    mk("headers", "technical", "Security headers",
      hsts ? "pass" : browserMode ? "info" : "warn", "low",
      hsts
        ? "Strict-Transport-Security present."
        : browserMode
          ? "Response headers aren't exposed to the browser, so HSTS can't be checked here."
          : "No HSTS header returned.",
      "Security headers are a light trust signal and protect users from downgrade attacks.",
      "Send Strict-Transport-Security: max-age=31536000; includeSubDomains."),
  );

  /* ---------- On-Page SEO (20%) ---------- */
  const titleLen = page.title?.length ?? 0;
  checks.push(
    mk("title", "onpage", "Title tag",
      titleLen === 0 ? "fail" : titleLen >= 30 && titleLen <= 62 ? "pass" : "warn",
      "critical",
      page.title ? `${titleLen} characters: “${page.title}”` : "The page has no <title>.",
      "The title is the clickable headline in search results — it drives CTR more than almost anything else.",
      "Write a 30–60 character title with the primary keyword first and the brand last."),
  );

  const descLen = page.description?.length ?? 0;
  checks.push(
    mk("description", "onpage", "Meta description",
      descLen === 0 ? "fail" : descLen >= 70 && descLen <= 160 ? "pass" : "warn",
      "high",
      page.description ? `${descLen} characters.` : "No meta description.",
      "Google often rewrites weak descriptions; a good one lifts click-through without changing rank.",
      "Write 70–155 characters: the benefit, the entity, and a reason to click."),
  );

  checks.push(
    mk("h1", "onpage", "Single H1",
      page.h1s.length === 1 ? "pass" : page.h1s.length === 0 ? "fail" : "warn",
      "high",
      page.h1s.length === 0 ? "No H1 found." : `${page.h1s.length} H1(s): ${page.h1s.slice(0, 3).map((h) => `“${h.slice(0, 60)}”`).join(", ")}`,
      "The H1 states the page's topic for both readers and crawlers.",
      "Keep exactly one H1 that matches search intent, then structure the rest as H2/H3."),
  );

  let skipped = 0;
  for (let i = 1; i < page.headings.length; i++) {
    if (page.headings[i].level - page.headings[i - 1].level > 1) skipped++;
  }
  checks.push(
    mk("hierarchy", "onpage", "Heading hierarchy",
      skipped === 0 ? "pass" : skipped < 3 ? "warn" : "fail",
      "low",
      skipped === 0 ? "No skipped heading levels." : `${skipped} heading level jump(s) detected.`,
      "Skipped levels make the outline harder for screen readers and AI parsers to follow.",
      "Never jump from H1 to H3; nest headings in order."),
  );

  const internal = page.links.filter((l) => l.internal).length;
  checks.push(
    mk("internal-links", "onpage", "Internal linking",
      internal >= 10 ? "pass" : internal >= 4 ? "warn" : "fail",
      "medium",
      `${internal} internal link(s) on the page.`,
      "Internal links spread authority and help crawlers discover the rest of the site.",
      "Link to your 5–10 most valuable pages from the homepage using descriptive anchors."),
  );

  const vague = page.links.filter((l) => /^(click here|read more|learn more|here|this)$/i.test(l.text.trim())).length;
  checks.push(
    mk("anchors", "onpage", "Descriptive anchor text",
      vague === 0 ? "pass" : vague < 3 ? "warn" : "fail",
      "low",
      vague === 0 ? "All anchors are descriptive." : `${vague} generic anchor(s) like “read more”.`,
      "Anchor text is a hint about what the target page is about.",
      "Replace “read more” with the destination's topic, e.g. “staking rewards explained”."),
  );

  const path = new URL(page.finalUrl).pathname;
  const cleanUrl = path.length <= 90 && !/[A-Z]/.test(path) && !/[?&]/.test(path);
  checks.push(
    mk("url", "onpage", "URL structure",
      cleanUrl ? "pass" : "warn", "low",
      `Path: ${path}`,
      "Short, lowercase, hyphenated URLs are easier to share, read and re-type.",
      "Use lowercase hyphenated slugs under 90 characters and drop tracking parameters."),
  );

  const ogOk = page.og["og:title"] && page.og["og:description"] && page.og["og:image"];
  checks.push(
    mk("og", "onpage", "Open Graph tags",
      ogOk ? "pass" : page.og["og:title"] || page.og["og:image"] ? "warn" : "fail",
      "medium",
      ogOk ? "og:title, og:description and og:image are set." : `Missing: ${["og:title", "og:description", "og:image"].filter((k) => !page.og[k]).join(", ") || "all OG tags"}.`,
      "OG tags decide how your link looks when it's shared on X, LinkedIn, Slack and WhatsApp.",
      "Add og:title, og:description and a 1200×630 og:image."),
  );

  const twitter = page.html.includes('name="twitter:card"') || page.html.includes('name="twitter:image"');
  checks.push(
    mk("twitter", "onpage", "Twitter / X card",
      twitter ? "pass" : "warn", "low",
      twitter ? "Twitter card meta present." : "No twitter:card meta.",
      "Without a card, X falls back to a plain text link.",
      "Add <meta name=\"twitter:card\" content=\"summary_large_image\"> plus title, description and image."),
  );

  /* ---------- Content Quality (23%) ---------- */
  checks.push(
    mk("words", "content", "Content depth",
      page.wordCount >= 600 ? "pass" : page.wordCount >= 300 ? "warn" : "fail",
      "high",
      `${page.wordCount} words of visible text.`,
      "Thin pages struggle to demonstrate expertise and are the first to lose to competitors.",
      "Aim for 600+ words on the homepage, more on pillar pages — depth, not padding."),
  );

  checks.push(
    mk("eeat-author", "content", "Author / brand identity (E-E-A-T)",
      page.author || page.sameAs.length > 0 ? "pass" : "warn",
      "high",
      page.author ? `Author signal found (${page.author}).` : "No author, byline or sameAs identity found.",
      "Google's quality raters look for who is behind the content; AI engines cite named entities.",
      "Add an author byline with credentials, or Organization schema with sameAs links."),
  );

  const aboutLink = page.links.some((l) => /\/(about|contact|team)\b/i.test(l.href));
  checks.push(
    mk("eeat-pages", "content", "About / Contact pages",
      aboutLink ? "pass" : "warn", "medium",
      aboutLink ? "The page links to About or Contact." : "No About or Contact link found on the page.",
      "Trust pages are a direct E-E-A-T signal and required for most YMYL topics.",
      "Link to /about and /contact from the header and footer."),
  );

  checks.push(
    mk("freshness", "content", "Publication / updated dates",
      page.dates.published || page.dates.modified ? "pass" : "warn",
      "low",
      page.dates.modified ? `Last modified: ${page.dates.modified}` : page.dates.published ? `Published: ${page.dates.published}` : "No date signals exposed in markup.",
      "Dates help search engines decide freshness and show up in result snippets.",
      "Expose datePublished and dateModified in Article schema and visible page copy."),
  );

  const outbound = page.links.filter((l) => !l.internal && l.href.startsWith("http")).length;
  checks.push(
    mk("citations", "content", "Outbound citations",
      outbound >= 3 ? "pass" : outbound >= 1 ? "warn" : "fail",
      "low",
      `${outbound} external link(s).`,
      "Citing primary sources is how content earns trust — and how LLMs decide what to quote.",
      "Link to 2–5 authoritative sources for every factual claim."),
  );

  const avgSentence = avgSentenceWords(page.text);
  checks.push(
    mk("readability", "content", "Readability",
      avgSentence === 0 ? "info" : avgSentence <= 22 ? "pass" : avgSentence <= 30 ? "warn" : "fail",
      "low",
      avgSentence ? `Average sentence length: ${avgSentence} words.` : "Not enough prose to measure.",
      "Long sentences lose mobile readers and get summarised badly by AI engines.",
      "Keep sentences under 20 words; break long paragraphs into two."),
  );

  const h2s = page.headings.filter((h) => h.level === 2).length;
  checks.push(
    mk("structure", "content", "Scannable structure",
      h2s >= 3 ? "pass" : h2s >= 1 ? "warn" : "fail",
      "medium",
      `${h2s} H2 section(s).`,
      "Sections make the page skimmable and give AI answer engines clean chunks to extract.",
      "Break the page into 3–6 H2 sections, each answering one question."),
  );

  const titleLower = (page.title ?? "").toLowerCase();
  const h1Lower = (page.h1s[0] ?? "").toLowerCase();
  const overlap = titleLower && h1Lower && (titleLower.includes(h1Lower.slice(0, 20)) || h1Lower.includes(titleLower.slice(0, 20)));
  checks.push(
    mk("intent", "content", "Title / H1 consistency",
      overlap ? "pass" : titleLower && h1Lower ? "warn" : "info",
      "low",
      overlap ? "Title and H1 share the same core topic." : "Title and H1 describe the page differently.",
      "Mismatched signals confuse crawlers about which query the page should rank for.",
      "Align title, H1 and first paragraph around one primary keyword and intent."),
  );

  /* ---------- Schema (10%) ---------- */
  checks.push(
    mk("schema-present", "schema", "Structured data present",
      page.jsonLd.length === 0 ? "fail" : "pass", "high",
      page.jsonLd.length === 0 ? "No JSON-LD blocks found." : `${page.jsonLd.length} JSON-LD block(s) found.`,
      "Structured data is what produces rich results and unambiguous entity data for AI engines.",
      "Add Organization + WebSite schema to the homepage and BreadcrumbList to inner pages."),
  );

  checks.push(
    mk("schema-valid", "schema", "JSON-LD is valid",
      invalidJsonLd === 0 ? "pass" : "fail", "high",
      invalidJsonLd === 0 ? "All JSON-LD blocks parsed cleanly." : `${invalidJsonLd} block(s) failed to parse as JSON.`,
      "A broken script tag is invisible to Google entirely — it just gets dropped.",
      "Validate with the Rich Results Test and the Schema Markup Validator after every change."),
  );

  checks.push(
    mk("schema-core", "schema", "Core entity types",
      ldTypes.has("Organization") || ldTypes.has("WebSite") ? "pass" : "warn",
      "medium",
      ldTypes.size ? `Detected: ${[...ldTypes].slice(0, 6).join(", ")}.` : "No schema types detected.",
      "Organization and WebSite are the base layer every other rich result builds on.",
      "Add {\"@type\":\"Organization\", name, url, logo, sameAs} and WebSite with potentialAction: SearchAction."),
  );

  checks.push(
    mk("schema-breadcrumb", "schema", "BreadcrumbList",
      ldTypes.has("BreadcrumbList") ? "pass" : "warn", "low",
      ldTypes.has("BreadcrumbList") ? "BreadcrumbList found." : "No BreadcrumbList markup.",
      "Breadcrumbs replace the raw URL in the SERP with a readable trail.",
      "Emit BreadcrumbList JSON-LD on every page below the homepage."),
  );

  const hasContentType = ["Article", "BlogPosting", "Product", "Service", "FAQPage", "HowTo"].some((t) => ldTypes.has(t));
  checks.push(
    mk("schema-content", "schema", "Content-type schema",
      hasContentType ? "pass" : "warn", "medium",
      hasContentType ? `Content schema: ${[...ldTypes].filter((t) => ["Article", "BlogPosting", "Product", "Service", "FAQPage", "HowTo"].includes(t)).join(", ")}.` : "No content-type schema (Article, Product, Service…).",
      "Matching schema to the page type unlocks the rich result for that type.",
      "Add the type that matches the page: Article, Product+Offer, Service, or FAQPage."),
  );

  /* ---------- Performance (estimated) (10%) ---------- */
  const kb = Math.round(page.bytes / 1024);
  checks.push(
    mk("weight", "performance", "HTML document weight",
      kb <= 120 ? "pass" : kb <= 250 ? "warn" : "fail",
      "medium",
      `${kb} KB of HTML.`,
      "Heavy documents delay first paint, especially on 4G.",
      "Stream/defer below-the-fold markup and inline only critical CSS."),
  );

  checks.push(
    mk("ttfb", "performance", "Time to first byte",
      page.ttfbMs <= 0 ? "info" : page.ttfbMs <= 800 ? "pass" : page.ttfbMs <= 1800 ? "warn" : "fail",
      "high",
      page.ttfbMs <= 0
        ? "Not measurable in browser mode — the proxy hides server latency."
        : `${page.ttfbMs} ms including network round trip.`,
      "TTFB is the floor for LCP — nothing can render before the HTML arrives.",
      "Cache at the edge (CDN/ISR) and cut server work on the hot path."),
  );

  const blocking = page.stylesheetCount + page.html.match(/<script(?![^>]*(defer|async|type="module"))[^>]*src=/gi)?.length! || 0;
  checks.push(
    mk("blocking", "performance", "Render-blocking resources",
      blocking <= 3 ? "pass" : blocking <= 7 ? "warn" : "fail",
      "medium",
      `${page.stylesheetCount} stylesheet(s) and ${page.scriptCount} external script(s) (≈${blocking} blocking).`,
      "Every blocking request delays LCP by a full round trip.",
      "Add defer/async to non-critical scripts and inline critical CSS."),
  );

  checks.push(
    mk("inline-js", "performance", "Inline script weight",
      page.inlineScriptBytes <= 40_000 ? "pass" : page.inlineScriptBytes <= 120_000 ? "warn" : "fail",
      "low",
      `${Math.round(page.inlineScriptBytes / 1024)} KB of inline JavaScript.`,
      "Inline JS can't be cached separately and blocks the parser.",
      "Move large inline scripts to cached files hydrated after paint."),
  );

  const preconnect = /rel=["']?(preconnect|dns-prefetch)/i.test(page.html);
  checks.push(
    mk("preconnect", "performance", "Preconnect to third parties",
      preconnect ? "pass" : "warn", "low",
      preconnect ? "preconnect/dns-prefetch hints found." : "No preconnect or dns-prefetch hints.",
      "Fonts, analytics and CDNs each cost a DNS + TLS handshake before they can load.",
      "Add <link rel=\"preconnect\"> for every third-party origin used above the fold."),
  );

  /* ---------- AI Search Readiness (10%) ---------- */
  checks.push(
    mk("llms", "ai", "llms.txt",
      site.llmsTxt ? "pass" : "fail", "high",
      site.llmsTxt ? `llms.txt found (${site.llmsTxt.length} bytes).` : "No /llms.txt at the site root.",
      "llms.txt is the emerging convention that tells AI assistants which pages to read and how to cite you.",
      "Publish /llms.txt: an H1 with your site name, a blockquote summary, then markdown links to key pages."),
  );

  const aiBots = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"];
  const blockedBots = site.robotsTxt ? aiBots.filter((bot) => robotsBlocks(robots, bot) === "blocked") : [];
  checks.push(
    mk("ai-crawlers", "ai", "AI crawler access",
      blockedBots.length === 0 ? "pass" : blockedBots.length < aiBots.length ? "warn" : "fail",
      "high",
      blockedBots.length === 0
        ? "No AI crawler is blocked in robots.txt."
        : `${blockedBots.join(", ")} blocked in robots.txt.`,
      "Blocking AI crawlers removes you from ChatGPT, Claude and Perplexity answers — a growing chunk of demand.",
      "Allow GPTBot, ClaudeBot, PerplexityBot and Google-Extended unless you have a licensing reason not to."),
  );

  const textRatio = page.html.length ? page.text.length / page.html.length : 0;
  checks.push(
    mk("ssr", "ai", "Server-rendered content",
      page.wordCount > 250 && textRatio > 0.03 ? "pass" : page.wordCount > 80 ? "warn" : "fail",
      "high",
      `${page.wordCount} words in the raw HTML (${Math.round(textRatio * 100)}% of the document).`,
      "AI crawlers read the HTML, not your hydrated React tree. If the text is JS-only, you don't exist for them.",
      "Server-render or pre-render the copy that matters (SSR/SSG/ISR)."),
  );

  checks.push(
    mk("faq", "ai", "Question-shaped content",
      page.hasFaqMarkup || page.headings.some((h) => /\?$/.test(h.text)) ? "pass" : "warn",
      "medium",
      page.hasFaqMarkup ? "FAQPage schema found." : page.headings.some((h) => /\?$/.test(h.text)) ? "Question-style headings found." : "No FAQ block or question headings.",
      "Answer engines lift passages that directly answer a question — with or without FAQ schema.",
      "Add a 4–8 question FAQ section with one-paragraph answers and FAQPage JSON-LD."),
  );

  checks.push(
    mk("semantic", "ai", "Semantic HTML landmarks",
      page.semanticTags.length >= 3 ? "pass" : page.semanticTags.length >= 1 ? "warn" : "fail",
      "low",
      page.semanticTags.length ? `Landmarks: <${page.semanticTags.join(">, <")}>.` : "No semantic landmarks (main/nav/article).",
      "Semantic landmarks are how agents and screen readers build an outline of the page.",
      "Wrap the page in <header>, <main>, <article> and <nav>."),
  );

  checks.push(
    mk("entity", "ai", "Entity / sameAs signals",
      page.sameAs.length >= 2 ? "pass" : page.sameAs.length === 1 ? "warn" : "fail",
      "medium",
      page.sameAs.length ? `${page.sameAs.length} sameAs link(s) found.` : "No sameAs links in structured data.",
      "sameAs ties your brand to its Wikipedia, LinkedIn, X and Crunchbase profiles — the graph LLMs traverse.",
      "Add sameAs arrays to your Organization schema pointing at every official profile."),
  );

  /* ---------- Images (5%) ---------- */
  const imgs = page.images;
  const missingAlt = imgs.filter((i) => i.alt === null || i.alt.trim() === "").length;
  const altRatio = imgs.length ? 1 - missingAlt / imgs.length : 1;
  checks.push(
    mk("alt", "images", "Alt text coverage",
      imgs.length === 0 ? "info" : altRatio >= 0.95 ? "pass" : altRatio >= 0.8 ? "warn" : "fail",
      "medium",
      imgs.length === 0 ? "No images on the page." : `${imgs.length - missingAlt}/${imgs.length} images have alt text.`,
      "Alt text feeds image search, accessibility, and helps AI systems understand visuals.",
      "Describe the image's content and purpose in alt — decorative images get alt=\"\"."),
  );

  const modern = imgs.filter((i) => /\.(webp|avif)(\?|$)/i.test(i.src)).length;
  checks.push(
    mk("formats", "images", "Modern image formats",
      imgs.length === 0 ? "info" : modern / imgs.length >= 0.5 ? "pass" : "warn",
      "low",
      imgs.length === 0 ? "No images to evaluate." : `${modern}/${imgs.length} images use WebP/AVIF.`,
      "WebP/AVIF typically cuts image weight 25–70% versus JPEG/PNG.",
      "Serve WebP with AVIF fallback via <picture> or your image CDN."),
  );

  const sized = imgs.filter((i) => i.width && i.height).length;
  checks.push(
    mk("dimensions", "images", "Width/height declared",
      imgs.length === 0 ? "info" : sized / imgs.length >= 0.8 ? "pass" : "warn",
      "medium",
      imgs.length === 0 ? "No images to evaluate." : `${sized}/${imgs.length} images declare width and height.`,
      "Images without dimensions cause layout shift — the CLS part of Core Web Vitals.",
      "Always set width and height (or aspect-ratio) on <img>."),
  );

  checks.push(
    mk("lazy", "images", "Lazy loading below the fold",
      imgs.length === 0 ? "info" : imgs.filter((i) => i.loading === "lazy").length >= Math.max(1, imgs.length - 2) ? "pass" : "warn",
      "low",
      `${imgs.filter((i) => i.loading === "lazy").length}/${imgs.length} images use loading="lazy".`,
      "Lazy loading keeps offscreen images from competing with the LCP resource.",
      "Add loading=\"lazy\" to everything except the hero image, which should be eager + fetchpriority=high."),
  );

  return buildReport(site, checks, jsonLdNodes);
}

/* ------------------------------------------------------------------ */
/* scoring + report assembly                                           */
/* ------------------------------------------------------------------ */

function buildReport(site: SiteSnapshot, checks: Check[], _jsonLdNodes: any[]): Report {
  const categories: CategoryResult[] = CATEGORIES.map((meta) => {
    const own = checks.filter((c) => c.category === meta.key);
    const scored = own.filter((c) => c.status !== "info");
    const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0) || 1;
    const earned = scored.reduce((sum, c) => sum + c.weight * STATUS_VALUE[c.status], 0);
    return {
      ...meta,
      score: Math.round((earned / totalWeight) * 100),
      passed: own.filter((c) => c.status === "pass").length,
      warnings: own.filter((c) => c.status === "warn").length,
      failed: own.filter((c) => c.status === "fail").length,
      checks: own,
    };
  });

  const score = Math.round(
    categories.reduce((sum, c) => sum + c.score * c.weight, 0) /
      categories.reduce((sum, c) => sum + c.weight, 0),
  );

  const grade =
    score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 55 ? "D" : score >= 40 ? "E" : "F";

  const toItem = (c: Check): ActionItem => ({
    id: c.id,
    title: c.title,
    severity: c.severity,
    category: c.category,
    categoryLabel: CATEGORIES.find((m) => m.key === c.category)?.label ?? c.category,
    fix: c.fix,
    evidence: c.evidence,
  });

  const failing = checks
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((a, b) => {
      const s = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (s !== 0) return s;
      if (a.status !== b.status) return a.status === "fail" ? -1 : 1;
      return b.weight - a.weight;
    });

  const phases = [
    { phase: "Phase 1 · Critical fixes", timeframe: "This week", match: (c: Check) => c.severity === "critical" && c.status === "fail" },
    { phase: "Phase 2 · High-impact improvements", timeframe: "Weeks 2–3", match: (c: Check) => c.severity === "high" && c.status !== "pass" },
    { phase: "Phase 3 · Content & authority", timeframe: "Month 2", match: (c: Check) => (c.severity === "medium" || c.category === "content") && c.status !== "pass" },
    { phase: "Phase 4 · Monitoring & polish", timeframe: "Ongoing", match: (c: Check) => (c.severity === "low" || c.severity === "info") && c.status !== "pass" },
  ];

  const used = new Set<string>();
  const actionPlan = phases.map((p) => {
    const items = failing.filter((c) => !used.has(c.id) && p.match(c));
    items.forEach((c) => used.add(c.id));
    return { phase: p.phase, timeframe: p.timeframe, items: items.map(toItem) };
  });

  const quickWins = failing
    .filter((c) => c.status === "fail" && (c.severity === "critical" || c.severity === "high"))
    .slice(0, 3)
    .map(toItem);

  const page = site.homepage;

  return {
    url: site.requestedUrl,
    finalUrl: page.finalUrl,
    hostname: new URL(page.finalUrl).hostname,
    title: page.title,
    description: page.description,
    score,
    grade,
    categories,
    actionPlan,
    quickWins,
    stats: {
      wordCount: page.wordCount,
      images: page.images.length,
      missingAlt: page.images.filter((i) => !i.alt || !i.alt.trim()).length,
      internalLinks: page.links.filter((l) => l.internal).length,
      externalLinks: page.links.filter((l) => !l.internal && l.href.startsWith("http")).length,
      headings: page.headings.length,
      ttfbMs: page.ttfbMs,
      pageKb: Math.round(page.bytes / 1024),
      scripts: page.scriptCount,
      pagesScanned: 1 + site.extraPages.length,
    },
    fetchedAt: site.fetchedAt,
    demo: site.demo,
    notes: site.notes,
  };
}
