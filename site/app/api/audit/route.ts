import { NextResponse } from "next/server";
import { AuditError, crawlSite } from "@/lib/audit/crawl";
import { runChecks } from "@/lib/audit/checks";
import { demoSite } from "@/lib/audit/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Small in-memory guard so an open endpoint can't be used as a crawler.
const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 20;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

export async function POST(request: Request) {
  let body: { url?: string; demo?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body: { url }." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url && !body.demo) {
    return NextResponse.json({ ok: false, error: "A URL is required." }, { status: 400 });
  }

  if (body.demo) {
    const target = url || "https://scostaking.example";
    return NextResponse.json({ ok: true, report: runChecks(demoSite(target)) });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, reason: "rate", error: "Too many audits from this IP. Try again in an hour." },
      { status: 429 },
    );
  }

  try {
    const site = await crawlSite(url);
    return NextResponse.json({ ok: true, report: runChecks(site) });
  } catch (err) {
    if (err instanceof AuditError) {
      const status = err.reason === "invalid" || err.reason === "blocked" ? 400 : 502;
      return NextResponse.json({ ok: false, reason: err.reason, error: err.message }, { status });
    }
    console.error("audit failed", err);
    return NextResponse.json(
      { ok: false, reason: "unknown", error: "The audit failed unexpectedly." },
      { status: 500 },
    );
  }
}
