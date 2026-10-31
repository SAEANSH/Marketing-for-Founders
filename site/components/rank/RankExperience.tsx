"use client";

import { useState } from "react";
import Link from "next/link";
import type { RankReport } from "@/lib/rank/analyze";

type State =
  | { kind: "idle" }
  | { kind: "loading"; mode: "server" | "browser" }
  | { kind: "error"; message: string; reason?: string }
  | { kind: "done"; report: RankReport };

const STEPS = [
  "Checking the URL is safe to fetch…",
  "Downloading your page…",
  "Querying the search results for your keyword…",
  "Matching your domain against the ranking pages…",
  "Auditing keyword coverage across title, H1, copy and alt text…",
];

function positionLabel(report: RankReport): { value: string; tone: string; note: string } {
  if (!report.serpAvailable) {
    return {
      value: "—",
      tone: "muted",
      note: "Search results couldn't be fetched from here. Deploy the site for live positions.",
    };
  }
  if (report.position === null) {
    return { value: "30+", tone: "bad", note: `Not found in the top 30 results for “${report.keyword}”.` };
  }
  const tone = report.position <= 3 ? "great" : report.position <= 10 ? "good" : report.position <= 20 ? "ok" : "bad";
  const page = report.position <= 10 ? 1 : Math.ceil(report.position / 10);
  return {
    value: `#${report.position}`,
    tone,
    note: `Page ${page} · result ${report.position} for “${report.keyword}”.`,
  };
}

export default function RankExperience() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [step, setStep] = useState(0);

  async function runInBrowser(cleanUrl: string, cleanKeyword: string) {
    const { runBrowserRank } = await import("@/lib/rank/browser");
    const result = await runBrowserRank(cleanUrl, cleanKeyword);
    if (result.ok) setState({ kind: "done", report: result.report });
    else setState({ kind: "error", message: result.error, reason: "network" });
  }

  async function run(demo = false) {
    const cleanUrl = demo ? "scostaking.example" : url.trim();
    const cleanKeyword = demo ? "sco staking" : keyword.trim();
    if (!cleanUrl || !cleanKeyword) return;
    if (demo) {
      setUrl(cleanUrl);
      setKeyword(cleanKeyword);
    }

    setState({ kind: "loading", mode: "server" });
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 800);

    try {
      const res = await fetch("/api/rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: cleanUrl, keyword: cleanKeyword, demo }),
      });
      const data = await res.json();
      clearInterval(timer);

      if (res.ok && data.ok) {
        setState({ kind: "done", report: data.report as RankReport });
        return;
      }

      if (!demo && (data.reason === "network" || data.reason === "unknown")) {
        setState({ kind: "loading", mode: "browser" });
        await runInBrowser(cleanUrl, cleanKeyword);
        return;
      }

      setState({ kind: "error", message: data.error ?? "The ranking check failed.", reason: data.reason });
    } catch {
      clearInterval(timer);
      setState({ kind: "loading", mode: "browser" });
      await runInBrowser(cleanUrl, cleanKeyword);
    }
  }

  const pos = state.kind === "done" ? positionLabel(state.report) : null;

  return (
    <div className="audit-page">
      <section className="audit-hero">
        <div className="container">
          <span className="eyebrow">
            <span className="dot" /> Ranking check · DuckDuckGo live results
          </span>
          <h1>
            Where do you <em>actually</em> rank?
          </h1>
          <p className="lead">
            Enter your website and one keyword. We pull the live top 30 results, find your domain,
            and score how well the page is optimised for that exact keyword — then show you the
            page that is outranking you.
          </p>

          <form
            className="audit-form rank-form"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <div className="audit-input-wrap">
              <span className="input-icon">https://</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="yourwebsite.com"
                aria-label="Website to check"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="audit-input-wrap">
              <span className="input-icon">🔍</span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="keyword, e.g. hsn code finder"
                aria-label="Keyword"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-lg" type="submit" disabled={state.kind === "loading"}>
              {state.kind === "loading" ? "Checking…" : "Check ranking →"}
            </button>
          </form>

          <p className="audit-hint">
            Free, no signup. Positions come from DuckDuckGo&apos;s public results — Google ordering
            can differ by a few places. Or{" "}
            <button className="linkbtn" type="button" onClick={() => run(true)}>
              see a sample check
            </button>
            .
          </p>
        </div>
      </section>

      <div className="container audit-body">
        {state.kind === "loading" && (
          <div className="audit-loading">
            <div className="spinner" />
            <div style={{ flex: 1 }}>
              <p className="loading-title">
                Checking {keyword || "your keyword"}
                {state.mode === "browser" && (
                  <span className="chip" style={{ marginLeft: 8 }}>browser mode</span>
                )}
              </p>
              <p className="loading-step">{STEPS[step]}</p>
              <div className="loading-bar">
                <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="audit-error">
            <h3>Couldn&apos;t check that keyword</h3>
            <p>{state.message}</p>
            <div className="audit-error-actions">
              <button className="btn" type="button" onClick={() => run()}>
                Try again
              </button>
              <Link className="btn ghost" href="/audit">
                Run a full audit instead →
              </Link>
            </div>
          </div>
        )}

        {state.kind === "done" && pos && (
          <div className="rank-report">
            <div className="rank-hero">
              <div className={`rank-position ${pos.tone}`}>
                <span className="rank-pos-label">Position</span>
                <span className="rank-pos-value">{pos.value}</span>
                <span className="rank-pos-domain">{state.report.hostname}</span>
              </div>
              <div className="rank-summary">
                <p className="rank-note">{pos.note}</p>
                <div className="rank-meta">
                  <span>
                    Keyword score <strong>{state.report.keywordScore}/100</strong>
                  </span>
                  <span>
                    <strong>{state.report.page.words}</strong> words
                  </span>
                  <span>
                    <strong>{state.report.page.headings}</strong> headings
                  </span>
                  <span>
                    <strong>{state.report.page.images}</strong> images
                  </span>
                </div>
                <div className="rank-bar">
                  <span style={{ width: `${state.report.keywordScore}%` }} />
                </div>
                <div className="rank-actions">
                  <Link className="btn" href={`/audit?url=${encodeURIComponent(state.report.finalUrl)}&run=1`}>
                    Run full SEO audit →
                  </Link>
                  <a
                    className="btn ghost"
                    href={state.report.finalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open the page ↗
                  </a>
                </div>
              </div>
            </div>

            <section className="report-section">
              <h3 className="section-title">How your result looks</h3>
              <div className="serp-preview">
                <span className="serp-url">{state.report.snippet.url}</span>
                <span className="serp-title">{state.report.snippet.title}</span>
                <span className="serp-desc">{state.report.snippet.description}</span>
              </div>
            </section>

            {state.report.serpAvailable && (
              <section className="report-section">
                <h3 className="section-title">Live results for “{state.report.keyword}”</h3>
                <div className="serp-table">
                  {state.report.serp.slice(0, 10).map((r) => (
                    <div className={`serp-row ${r.isTarget ? "you" : ""}`} key={`${r.position}-${r.url}`}>
                      <span className="serp-pos">{r.position}</span>
                      <div>
                        <a href={r.url} target="_blank" rel="noreferrer noopener" className="serp-row-title">
                          {r.title}
                        </a>
                        <span className="serp-row-host">
                          {r.hostname}
                          {r.isTarget && <span className="chip" style={{ marginLeft: 8 }}>you</span>}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="report-section">
              <h3 className="section-title">Keyword optimisation for “{state.report.keyword}”</h3>
              <div className="kw-checks">
                {state.report.checks.map((check) => (
                  <div className={`kw-check ${check.status}`} key={check.id}>
                    <span className="kw-icon">
                      {check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✕"}
                    </span>
                    <div>
                      <strong>{check.label}</strong>
                      <p>{check.detail}</p>
                      {check.status !== "pass" && <p className="kw-fix">{check.fix}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <ul className="report-notes">
              {state.report.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        {state.kind === "idle" && (
          <div className="audit-idle">
            <h2>What you get</h2>
            <div className="idle-grid">
              {[
                ["Live position", "Your domain's place in the top 30 results for the keyword, highlighted in the result list."],
                ["Keyword score", "12 checks: title, meta, H1, first 100 words, URL, density, subheadings, alt text, length and more."],
                ["SERP preview", "The exact title, URL and description a searcher sees — before you publish a rewrite."],
                ["Next step", "One click into the full claude-seo audit: technical SEO, schema, AI search readiness and images."],
              ].map(([title, body]) => (
                <div className="idle-card" key={title}>
                  <div className="idle-card-head">
                    <strong>{title}</strong>
                  </div>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
