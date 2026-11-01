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

export type SerpOptions = { device?: string; country?: string };

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

/** DuckDuckGo regional codes — `kl` uses <region>-<lang>. */
const REGIONS: Record<string, string> = {
  in: "in-en",
  us: "us-en",
  gb: "uk-en",
  au: "au-en",
  ca: "ca-en",
  de: "de-de",
  fr: "fr-fr",
  es: "es-es",
  it: "it-it",
  br: "br-pt",
  nl: "nl-nl",
  ae: "xa-ar",
};

/** Server-side SERP lookup. Returns null when every engine refuses us. */
export async function fetchSerp(keyword: string, options: SerpOptions = {}): Promise<SerpResult[] | null> {
  const region = options.country && REGIONS[options.country] ? `&kl=${REGIONS[options.country]}` : "";
  const ua = options.device === "mobile" ? MOBILE_UA : UA;
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(keyword)}${region}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(keyword)}${region}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: {
          "user-agent": ua,
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
