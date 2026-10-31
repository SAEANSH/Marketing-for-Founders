import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import type { PageSnapshot, SiteSnapshot } from "./types";

const UA =
  "Mozilla/5.0 (compatible; ClaudeSEO-Audit/1.0; +https://github.com/AgriciDaniel/claude-seo)";
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;

export class AuditError extends Error {
  reason: "invalid" | "blocked" | "network" | "http" | "too-large";
  constructor(reason: AuditError["reason"], message: string) {
    super(message);
    this.reason = reason;
    this.name = "AuditError";
  }
}

/* ------------------------------------------------------------------ */
/* URL safety — the same SSRF protection claude-seo's url_safety.py has */
/* ------------------------------------------------------------------ */

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254",
]);

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80") ||
    v6.startsWith("::ffff:127") ||
    v6.startsWith("::ffff:10")
  );
}

export async function assertSafeUrl(input: string): Promise<URL> {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim())
    ? input.trim()
    : `https://${input.trim()}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new AuditError("invalid", "That doesn't look like a valid URL.");
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new AuditError("invalid", "Only http:// and https:// URLs can be audited.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || !host.includes(".") || BLOCKED_HOSTS.has(host) || /\.(local|internal|lan)$/.test(host)) {
    throw new AuditError("blocked", "That host is not publicly reachable, so it can't be audited.");
  }

  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new AuditError("blocked", "Private and reserved IPs are blocked.");
  } else {
    try {
      const records = await dns.lookup(host, { all: true });
      if (records.length === 0 || records.some((r) => isPrivateIp(r.address))) {
        throw new AuditError("blocked", "That host resolves to a private address.");
      }
    } catch (err) {
      if (err instanceof AuditError) throw err;
      throw new AuditError("network", `Couldn't resolve ${host}.`);
    }
  }

  return url;
}

/* ------------------------------------------------------------------ */
/* Fetching                                                            */
/* ------------------------------------------------------------------ */

type Fetched = {
  status: number;
  finalUrl: string;
  redirects: number;
  html: string;
  headers: Record<string, string>;
  ttfbMs: number;
  bytes: number;
};

async function fetchWithRedirects(start: URL, referer?: string): Promise<Fetched> {
  let current = start;
  let redirects = 0;
  const startedAt = Date.now();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new AuditError(
        "network",
        `Couldn't reach ${current.hostname}. The site may be down, blocking bots, or unreachable from this server.`,
      );
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (redirects >= MAX_REDIRECTS) throw new AuditError("http", "Too many redirects.");
      const next = new URL(location, current);
      await assertSafeUrl(next.toString());
      current = next;
      redirects++;
      continue;
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 5_000_000) throw new AuditError("too-large", "Page is larger than 5 MB.");

    return {
      status: res.status,
      finalUrl: current.toString(),
      redirects,
      html: new TextDecoder("utf-8").decode(buffer),
      headers: Object.fromEntries(res.headers.entries()),
      ttfbMs: Date.now() - startedAt,
      bytes: buffer.byteLength,
    };
  }

  throw new AuditError("http", "Too many redirects.");
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 400_000);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* HTML parsing                                                        */
/* ------------------------------------------------------------------ */

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|json|xml|pdf|zip|mp4|woff2?)$/i;

export function parsePage(fetched: Fetched): PageSnapshot {
  const $ = cheerio.load(fetched.html);
  const base = new URL(fetched.finalUrl);

  const attr = (sel: string, name: string): string | null => {
    const value = $(sel).first().attr(name);
    return value === undefined ? null : value;
  };

  const text = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = text ? text.split(" ").length : 0;

  const headings: { level: number; text: string }[] = [];
  $("h1,h2,h3,h4").each((_, el) => {
    const level = Number(($(el).prop("tagName") ?? "h2").slice(1));
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) headings.push({ level, text: t });
  });

  const images = $("img")
    .toArray()
    .slice(0, 120)
    .map((el) => ({
      src: $(el).attr("src") ?? "",
      alt: $(el).attr("alt") ?? null,
      loading: $(el).attr("loading") ?? null,
      width: $(el).attr("width") ?? null,
      height: $(el).attr("height") ?? null,
    }));

  const links = $("a[href]")
    .toArray()
    .slice(0, 400)
    .map((el) => {
      const href = $(el).attr("href") ?? "";
      let internal = false;
      try {
        const resolved = new URL(href, base);
        internal = resolved.origin === base.origin && !ASSET_RE.test(resolved.pathname);
      } catch {
        internal = href.startsWith("/");
      }
      return { href, text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 80), internal };
    })
    .filter((l) => l.href && !l.href.startsWith("#") && !l.href.startsWith("javascript:"));

  const jsonLd = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => $(el).text())
    .filter(Boolean);

  const og: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const key = $(el).attr("property");
    if (key) og[key] = $(el).attr("content") ?? "";
  });

  const sameAs: string[] = [];
  for (const block of jsonLd) {
    try {
      const parsed = JSON.parse(block);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node.sameAs)) sameAs.push(...node.sameAs.filter((v: unknown) => typeof v === "string"));
        if (typeof node.sameAs === "string") sameAs.push(node.sameAs);
        for (const value of Object.values(node)) {
          if (value && typeof value === "object") stack.push(value as object);
        }
      }
    } catch {
      /* invalid JSON-LD is reported by the schema checks, not here */
    }
  }

  const author =
    attr('meta[name="author"]', "content") ??
    (jsonLd.some((b) => /"author"/.test(b)) ? "JSON-LD author" : null);

  const published =
    attr('meta[property="article:published_time"]', "content") ??
    attr('time[datetime]', "datetime");
  const modified =
    attr('meta[property="article:modified_time"]', "content") ??
    attr('meta[name="last-modified"]', "content");

  const inlineScriptBytes = $("script:not([src])")
    .toArray()
    .reduce((sum, el) => sum + ($(el).html()?.length ?? 0), 0);

  const semanticTags = ["main", "nav", "header", "footer", "article", "section"].filter(
    (tag) => $(tag).length > 0,
  );

  return {
    url: fetched.finalUrl,
    status: fetched.status,
    finalUrl: fetched.finalUrl,
    redirects: fetched.redirects,
    html: fetched.html,
    text,
    headers: fetched.headers,
    ttfbMs: fetched.ttfbMs,
    bytes: fetched.bytes,
    title: $("title").first().text().trim() || null,
    description: attr('meta[name="description"]', "content"),
    canonical: attr('link[rel="canonical"]', "href"),
    robotsMeta: attr('meta[name="robots"]', "content"),
    lang: $("html").attr("lang") ?? null,
    h1s: $("h1")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter(Boolean),
    headings,
    images,
    links,
    jsonLd,
    scriptCount: $("script[src]").length,
    stylesheetCount: $('link[rel="stylesheet"]').length,
    inlineScriptBytes,
    wordCount,
    og,
    hasFaqMarkup: jsonLd.some((b) => /"FAQPage"/.test(b)) || $('[itemtype*="FAQPage"]').length > 0,
    semanticTags,
    sameAs: [...new Set(sameAs)],
    dates: { published: published ?? null, modified: modified ?? null },
    author,
  };
}

/* ------------------------------------------------------------------ */
/* Site crawl                                                          */
/* ------------------------------------------------------------------ */

/** Fetch and parse one page (used by the ranking check). */
export async function fetchPage(rawUrl: string): Promise<PageSnapshot> {
  const url = await assertSafeUrl(rawUrl);
  const fetched = await fetchWithRedirects(url);
  if (fetched.status >= 400) {
    throw new AuditError("http", `The page answered with HTTP ${fetched.status}.`);
  }
  return parsePage(fetched);
}

export async function crawlSite(rawUrl: string): Promise<SiteSnapshot> {
  const url = await assertSafeUrl(rawUrl);
  const notes: string[] = [];

  const fetched = await fetchWithRedirects(url);
  if (fetched.status >= 400) {
    throw new AuditError("http", `The page answered with HTTP ${fetched.status}.`);
  }

  const homepage = parsePage(fetched);
  const origin = new URL(fetched.finalUrl).origin;
  const root = `${origin}/`;

  const [robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
    fetchText(`${root}robots.txt`),
    fetchText(`${root}sitemap.xml`),
    fetchText(`${root}llms.txt`),
  ]);

  // A light second pass: check a handful of internal links actually resolve.
  const seen = new Set<string>();
  const targets = homepage.links
    .filter((l) => l.internal)
    .map((l) => {
      try {
        return new URL(l.href, fetched.finalUrl).toString();
      } catch {
        return null;
      }
    })
    .filter((u): u is string => Boolean(u))
    .filter((u) => {
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    })
    .slice(0, 4);

  const extraPages = await Promise.all(
    targets.map(async (target) => {
      try {
        const res = await fetch(target, {
          headers: { "user-agent": UA },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        const html = await res.text();
        const $ = cheerio.load(html);
        return {
          url: target,
          status: res.status,
          title: $("title").first().text().trim() || null,
          description: $('meta[name="description"]').attr("content") ?? null,
        };
      } catch {
        return { url: target, status: 0, title: null, description: null };
      }
    }),
  );

  notes.push(`Crawled ${1 + extraPages.length} page(s) with a 12 s timeout per request.`);

  return {
    requestedUrl: rawUrl,
    origin,
    homepage,
    robotsTxt,
    sitemapXml,
    llmsTxt,
    extraPages,
    fetchedAt: new Date().toISOString(),
    demo: false,
    notes,
  };
}
