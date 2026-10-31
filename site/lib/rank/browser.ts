import { parseHtmlInBrowser, throughProxy } from "@/lib/audit/browser";
import type { PageSnapshot } from "@/lib/audit/types";
import {
  analyzeKeyword,
  buildSnippet,
  decorateSerp,
  hostOf,
  scoreChecks,
  type RankReport,
  type SerpResult,
} from "./analyze";

function unwrap(href: string): string {
  try {
    if (href.startsWith("//")) href = `https:${href}`;
    const url = new URL(href);
    const uddg = url.searchParams.get("uddg") ?? url.searchParams.get("u");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return href;
  }
}

export function parseSerpInBrowser(html: string): SerpResult[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const results: SerpResult[] = [];

  doc.querySelectorAll("div.result, div.web-result").forEach((el) => {
    const anchor = el.querySelector("a.result__a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href) return;
    const url = unwrap(href);
    const title = (anchor.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!title) return;
    results.push({
      position: results.length + 1,
      url,
      hostname: hostOf(url),
      title,
      snippet: (el.querySelector(".result__snippet")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      isTarget: false,
    });
  });

  if (results.length === 0) {
    doc.querySelectorAll("a.result-link").forEach((el) => {
      const href = el.getAttribute("href");
      if (!href) return;
      const url = unwrap(href);
      const title = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!title) return;
      results.push({
        position: results.length + 1,
        url,
        hostname: hostOf(url),
        title,
        snippet: "",
        isTarget: false,
      });
    });
  }

  return results.slice(0, 30);
}

export type BrowserRankResult = { ok: true; report: RankReport } | { ok: false; error: string };

export async function runBrowserRank(input: string, keyword: string): Promise<BrowserRankResult> {
  const target = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;

  const html = await throughProxy(target);
  if (!html || !/<html|<!doctype|<head|<body/i.test(html.slice(0, 4000))) {
    return {
      ok: false,
      error:
        "Couldn't fetch that page from your browser either — the site may block automated requests, or the proxies are rate-limited right now.",
    };
  }

  const page: PageSnapshot = parseHtmlInBrowser(html, target);
  const targetHost = hostOf(target);

  let serp: SerpResult[] | null = null;
  const serpHtml = await throughProxy(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`,
    12_000,
  );
  if (serpHtml) {
    const parsed = parseSerpInBrowser(serpHtml);
    if (parsed.length >= 3) serp = parsed;
  }

  const checks = analyzeKeyword(page, keyword);
  const decorated = serp ? decorateSerp(serp, targetHost) : { serp: [], position: null };

  return {
    ok: true,
    report: {
      url: input,
      finalUrl: target,
      hostname: targetHost,
      keyword,
      position: decorated.position,
      serpAvailable: Boolean(serp),
      serp: decorated.serp,
      keywordScore: scoreChecks(checks),
      checks,
      snippet: buildSnippet(page, keyword),
      page: {
        title: page.title,
        description: page.description,
        h1: page.h1s[0] ?? null,
        words: page.wordCount,
        images: page.images.length,
        headings: page.headings.length,
      },
      mode: "browser",
      fetchedAt: new Date().toISOString(),
      notes: [
        "Ran from your browser through a public CORS proxy — positions come from DuckDuckGo's public results page, which can differ from Google.",
        "Deploy the site to query the search results server-side with much higher reliability.",
      ],
    },
  };
}
