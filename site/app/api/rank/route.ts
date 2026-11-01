import { NextResponse } from "next/server";
import { AuditError, fetchPage } from "@/lib/audit/crawl";
import {
  analyzeKeyword,
  buildSnippet,
  decorateSerp,
  hostOf,
  scoreChecks,
} from "@/lib/rank/analyze";
import { fetchSerp } from "@/lib/rank/serp";
import { demoSite } from "@/lib/audit/demo";
import type { SerpResult } from "@/lib/rank/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { url?: string; keyword?: string; demo?: boolean; device?: string; country?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send JSON: { url, keyword }." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  const keyword = (body.keyword ?? "").trim();

  if (!body.demo && (!url || !keyword)) {
    return NextResponse.json({ ok: false, error: "A URL and a keyword are both required." }, { status: 400 });
  }

  if (body.demo) {
    const keywordDemo = keyword || "sco staking";
    const site = demoSite("https://scostaking.example");
    const page = site.homepage;
    const checks = analyzeKeyword(page, keywordDemo);
    const serp: SerpResult[] = [
      { position: 1, url: "https://www.coinbase.com/staking", hostname: "coinbase.com", title: "Staking crypto: how it works and what you earn", snippet: "Stake assets and earn rewards…", isTarget: false },
      { position: 2, url: "https://ethereum.org/en/staking/", hostname: "ethereum.org", title: "Staking | ethereum.org", snippet: "Staking is the process of…", isTarget: false },
      { position: 3, url: "https://www.kraken.com/staking", hostname: "kraken.com", title: "Crypto staking explained", snippet: "Earn rewards on your crypto…", isTarget: false },
      { position: 4, url: "https://www.binance.com/en/staking", hostname: "binance.com", title: "Staking — Binance", snippet: "Lock your tokens and earn…", isTarget: false },
      { position: 5, url: "https://www.investopedia.com/staking-5111969", hostname: "investopedia.com", title: "What is staking? Definition and how it works", snippet: "Staking locks crypto…", isTarget: false },
      { position: 6, url: "https://www.ledger.com/academy/what-is-staking", hostname: "ledger.com", title: "What is staking? A beginner's guide", snippet: "A complete guide…", isTarget: false },
      { position: 7, url: "https://scostaking.example/", hostname: "scostaking.example", title: "Sco Staking — Earn 12% APY", snippet: "Stake Sco tokens and earn rewards…", isTarget: true },
      { position: 8, url: "https://www.stakingrewards.com/", hostname: "stakingrewards.com", title: "Staking Rewards — Compare staking rates", snippet: "Compare yields across networks…", isTarget: false },
      { position: 9, url: "https://www.reddit.com/r/CryptoCurrency/wiki/staking", hostname: "reddit.com", title: "Staking explained — r/CryptoCurrency", snippet: "Community guide to staking…", isTarget: false },
    ];
    return NextResponse.json({
      ok: true,
      report: {
        url: "https://scostaking.example",
        finalUrl: page.finalUrl,
        hostname: "scostaking.example",
        keyword: keywordDemo,
        position: 7,
        serpAvailable: true,
        serp,
        keywordScore: scoreChecks(checks),
        checks,
        snippet: buildSnippet(page, keywordDemo),
        page: {
          title: page.title,
          description: page.description,
          h1: page.h1s[0] ?? null,
          words: page.wordCount,
          images: page.images.length,
          headings: page.headings.length,
        },
        mode: "server",
        demo: true,
        device: body.device === "mobile" ? "mobile" : "desktop",
        country: body.country ?? "",
        fetchedAt: new Date().toISOString(),
        notes: [
          "Sample check: the page is the bundled Sco Staking fixture and the result list is illustrative.",
          "Live checks query real search results and fetch your real page.",
        ],
      },
    });
  }

  try {
    const page = await fetchPage(url);
    const serp = await fetchSerp(keyword, { device: body.device, country: body.country });
    const checks = analyzeKeyword(page, keyword);
    const targetHost = hostOf(page.finalUrl);
    const decorated = serp ? decorateSerp(serp, targetHost) : { serp: [], position: null };

    return NextResponse.json({
      ok: true,
      report: {
        url,
        finalUrl: page.finalUrl,
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
        mode: "server",
        demo: false,
        device: body.device === "mobile" ? "mobile" : "desktop",
        country: body.country ?? "",
        fetchedAt: new Date().toISOString(),
        notes: [
          "Positions are read from DuckDuckGo's public results page; Google's ordering can differ.",
          "Add a paid SERP API key (DataForSEO, SerpApi, Seobility) in production for exact Google positions at scale.",
        ],
      },
    });
  } catch (err) {
    if (err instanceof AuditError) {
      return NextResponse.json(
        { ok: false, reason: err.reason, error: err.message },
        { status: err.reason === "invalid" || err.reason === "blocked" ? 400 : 502 },
      );
    }
    console.error("rank failed", err);
    return NextResponse.json(
      { ok: false, reason: "unknown", error: "The ranking check failed unexpectedly." },
      { status: 500 },
    );
  }
}
