import { runChecks } from "./checks";
import type { PageSnapshot, Report, SiteSnapshot } from "./types";

// Live crawling from the preview sandbox is blocked by the network allow-list,
// so the audit can also run inside the visitor's browser: the page is fetched
// through a public CORS proxy and parsed with DOMParser, then the exact same
// 45 checks run on it. Nothing is installed and no data leaves the browser
// except the request to the proxy.

type Proxy = { name: string; build: (url: string) => string; json?: boolean };

// Public CORS relays, tried in order. Different providers block different
// regions and rate limits, so the chain — not any single one — is the feature.
const PROXIES: Proxy[] = [
  {
    name: "allorigins-raw",
    build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  },
  {
    name: "allorigins-json",
    build: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    json: true,
  },
  {
    name: "codetabs",
    build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  },
  {
    name: "corsproxy",
    build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  },
  {
    name: "corsproxy-raw",
    build: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`,
  },
];

let preferred = 0;

export async function throughProxy(url: string, timeoutMs = 14_000): Promise<string | null> {
  const order = [preferred, ...PROXIES.map((_, i) => i).filter((i) => i !== preferred)];
  for (const index of order) {
    const proxy = PROXIES[index];
    try {
      const res = await fetch(proxy.build(url), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "*/*" },
      });
      if (!res.ok) continue;
      let text = await res.text();

      if (proxy.json) {
        try {
          const parsed = JSON.parse(text);
          const contents = parsed?.contents ?? parsed?.data ?? parsed?.body;
          if (typeof contents === "string") text = contents;
        } catch {
          /* treat as plain text */
        }
      }

      if (text && text.trim().length > 40) {
        preferred = index;
        return text;
      }
    } catch {
      /* try the next proxy */
    }
  }
  return null;
}

function looksLikeHtml(text: string): boolean {
  return /<html|<!doctype|<head|<body/i.test(text.slice(0, 4000));
}

function looksLikeChallenge(text: string): boolean {
  return /just a moment|cf-browser-verification|attention required|enable javascript and cookies/i.test(
    text.slice(0, 4000),
  );
}

/* ------------------------------------------------------------------ */
/* DOM parsing (mirrors lib/audit/crawl.ts parsePage)                  */
/* ------------------------------------------------------------------ */

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|json|xml|pdf|zip|mp4|woff2?)$/i;
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function parseHtmlInBrowser(html: string, finalUrl: string): PageSnapshot {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = new URL(finalUrl);
  const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();

  const meta = (selector: string) => doc.querySelector(selector)?.getAttribute("content") ?? null;
  const attr = (selector: string, name: string) => doc.querySelector(selector)?.getAttribute(name) ?? null;

  const headings: { level: number; text: string }[] = [];
  doc.querySelectorAll("h1, h2, h3, h4").forEach((el) => {
    const level = Number((el.tagName || "h2").slice(1));
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) headings.push({ level, text: t });
  });

  const images = Array.from(doc.querySelectorAll("img"))
    .slice(0, 120)
    .map((el) => ({
      src: el.getAttribute("src") ?? "",
      alt: el.hasAttribute("alt") ? el.getAttribute("alt") : null,
      loading: el.getAttribute("loading"),
      width: el.getAttribute("width"),
      height: el.getAttribute("height"),
    }));

  const links = Array.from(doc.querySelectorAll("a[href]"))
    .slice(0, 400)
    .map((el) => {
      const href = el.getAttribute("href") ?? "";
      let internal = false;
      try {
        const resolved = new URL(href, base);
        internal = resolved.origin === base.origin && !ASSET_RE.test(resolved.pathname);
      } catch {
        internal = href.startsWith("/");
      }
      return { href, text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80), internal };
    })
    .filter((l) => l.href && !l.href.startsWith("#") && !l.href.startsWith("javascript:"));

  const jsonLd = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((el) => el.textContent ?? "")
    .filter(Boolean);

  const og: Record<string, string> = {};
  doc.querySelectorAll('meta[property^="og:"]').forEach((el) => {
    const key = el.getAttribute("property");
    if (key) og[key] = el.getAttribute("content") ?? "";
  });

  const sameAs: string[] = [];
  for (const block of jsonLd) {
    try {
      const parsed = JSON.parse(block);
      const stack: any[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node.sameAs)) sameAs.push(...node.sameAs.filter((v: unknown) => typeof v === "string"));
        if (typeof node.sameAs === "string") sameAs.push(node.sameAs);
        for (const value of Object.values(node)) {
          if (value && typeof value === "object") stack.push(value);
        }
      }
    } catch {
      /* invalid JSON-LD is a finding, not a crash */
    }
  }

  const inlineScriptBytes = Array.from(doc.querySelectorAll("script:not([src])")).reduce(
    (sum, el) => sum + (el.textContent?.length ?? 0),
    0,
  );

  const semanticTags = ["main", "nav", "header", "footer", "article", "section"].filter(
    (tag) => doc.querySelector(tag) !== null,
  );

  return {
    url: finalUrl,
    finalUrl,
    status: 200,
    redirects: 0,
    html,
    text,
    headers: {},
    ttfbMs: 0,
    bytes: new TextEncoder().encode(html).length,
    title: (doc.querySelector("title")?.textContent ?? "").trim() || null,
    description: meta('meta[name="description"]'),
    canonical: attr('link[rel="canonical"]', "href"),
    robotsMeta: meta('meta[name="robots"]'),
    lang: doc.documentElement.getAttribute("lang"),
    h1s: Array.from(doc.querySelectorAll("h1"))
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
    headings,
    images,
    links,
    jsonLd,
    scriptCount: doc.querySelectorAll("script[src]").length,
    stylesheetCount: doc.querySelectorAll('link[rel="stylesheet"]').length,
    inlineScriptBytes,
    wordCount: text ? text.split(/\s+/).length : 0,
    og,
    hasFaqMarkup: jsonLd.some((b) => /"FAQPage"/.test(b)) || doc.querySelector('[itemtype*="FAQPage"]') !== null,
    semanticTags,
    sameAs: [...new Set(sameAs)],
    dates: {
      published: meta('meta[property="article:published_time"]') ?? attr("time[datetime]", "datetime"),
      modified:
        meta('meta[property="article:modified_time"]') ?? meta('meta[name="last-modified"]'),
    },
    author: meta('meta[name="author"]') ?? (jsonLd.some((b) => /"author"/.test(b)) ? "JSON-LD author" : null),
  };
}

/* ------------------------------------------------------------------ */
/* screenshot                                                          */
/* ------------------------------------------------------------------ */

export function screenshotCandidates(url: string): string[] {
  const clean = url.endsWith("/") ? url : `${url}/`;
  return [
    `https://s.wordpress.com/mshots/v1/${encodeURIComponent(clean)}?w=1200&h=800`,
    `https://image.thum.io/get/width/1200/crop/800/noanimate/${clean}`,
  ];
}

/* ------------------------------------------------------------------ */
/* audit                                                               */
/* ------------------------------------------------------------------ */

function candidatesFor(input: string): string[] {
  const trimmed = input.trim();
  if (ABSOLUTE.test(trimmed)) return [trimmed];
  return [`https://${trimmed}`, `http://${trimmed}`];
}

export type BrowserAuditResult =
  | { ok: true; report: Report }
  | { ok: false; error: string };

export async function runBrowserAudit(input: string): Promise<BrowserAuditResult> {
  let html: string | null = null;
  let finalUrl = "";

  for (const candidate of candidatesFor(input)) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    const fetched = await throughProxy(url.toString());
    if (!fetched) continue;

    if (looksLikeChallenge(fetched)) {
      return {
        ok: false,
        error:
          "That site is behind a bot-protection page (Cloudflare-style), so it can't be audited without executing JavaScript.",
      };
    }
    if (!looksLikeHtml(fetched)) continue;

    html = fetched;
    finalUrl = url.toString();
    break;
  }

  if (!html || !finalUrl) {
    return {
      ok: false,
      error:
        "Couldn't fetch that page. The site may be blocking automated requests, or the public proxy is unavailable right now — try again in a moment.",
    };
  }

  const origin = new URL(finalUrl).origin;
  const [robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
    throughProxy(`${origin}/robots.txt`, 9000),
    throughProxy(`${origin}/sitemap.xml`, 9000),
    throughProxy(`${origin}/llms.txt`, 9000),
  ]);

  const homepage = parseHtmlInBrowser(html, finalUrl);

  const site: SiteSnapshot = {
    requestedUrl: input,
    origin,
    homepage,
    robotsTxt,
    sitemapXml,
    llmsTxt,
    extraPages: [],
    fetchedAt: new Date().toISOString(),
    demo: false,
    mode: "browser",
    notes: [
      "Crawled from your browser through a public CORS proxy — response headers and true server latency aren't visible in this mode.",
      "Deploy the site to run the same checks server-side, where TTFB, HSTS and redirect chains can be measured directly.",
    ],
  };

  const report = runChecks(site);
  report.screenshot = screenshotCandidates(finalUrl)[0];
  return { ok: true, report };
}
