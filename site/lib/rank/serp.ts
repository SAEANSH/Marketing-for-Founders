import * as cheerio from "cheerio";
import type { SerpResult } from "./analyze";
import { hostOf } from "./analyze";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** DDG wraps every result in /l/?uddg=<encoded url>. Decode it. */
function unwrap(href: string): string {
  try {
    if (href.startsWith("//")) href = `https:${href}`;
    const url = new URL(href);
    const uddg = url.searchParams.get("uddg") ?? url.searchParams.get("u");
    if (uddg) return decodeURIComponent(uddg);
    return url.toString();
  } catch {
    return href;
  }
}

export function parseSerpHtml(html: string): SerpResult[] {
  const $ = cheerio.load(html);
  const results: SerpResult[] = [];

  $("div.result, div.web-result").each((_, el) => {
    const anchor = $(el).find("a.result__a").first();
    const href = anchor.attr("href");
    if (!href) return;
    const url = unwrap(href);
    const title = anchor.text().replace(/\s+/g, " ").trim();
    const snippet = $(el).find(".result__snippet").first().text().replace(/\s+/g, " ").trim();
    if (!title) return;
    results.push({
      position: results.length + 1,
      url,
      hostname: hostOf(url),
      title,
      snippet,
      isTarget: false,
    });
  });

  // DuckDuckGo Lite uses a simpler table layout
  if (results.length === 0) {
    $("a.result-link").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const url = unwrap(href);
      const title = $(el).text().replace(/\s+/g, " ").trim();
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

/** Server-side SERP lookup. Returns null when every engine refuses us. */
export async function fetchSerp(keyword: string): Promise<SerpResult[] | null> {
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(keyword)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const results = parseSerpHtml(html);
      if (results.length >= 3) return results;
    } catch {
      /* try the next endpoint */
    }
  }

  return null;
}
