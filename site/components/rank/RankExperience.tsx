"use client";

import { useState } from "react";
import type { RankReport } from "@/lib/rank/analyze";

type State =
  | { kind: "idle" }
  | { kind: "loading"; mode: "server" | "browser" }
  | { kind: "error"; message: string }
  | { kind: "done"; report: RankReport };

const COUNTRIES = [
  ["", "Worldwide"],
  ["in", "India"],
  ["us", "United States"],
  ["gb", "United Kingdom"],
  ["ae", "United Arab Emirates"],
  ["au", "Australia"],
  ["ca", "Canada"],
  ["de", "Germany"],
  ["fr", "France"],
  ["es", "Spain"],
  ["it", "Italy"],
  ["br", "Brazil"],
  ["nl", "Netherlands"],
] as const;

const STEPS = [
  "Fetching your page…",
  "Querying the search results…",
  "Matching your domain against the ranking pages…",
  "Auditing keyword coverage…",
];

function positionInfo(report: RankReport) {
  if (!report.serpAvailable) {
    return { label: "n/a", tone: "muted", text: "Search results couldn't be loaded right now." };
  }
  if (report.position === null) {
    return { label: ">30", tone: "bad", text: `Not found in the top 30 results for “${report.keyword}”.` };
  }
  const tone = report.position <= 3 ? "great" : report.position <= 10 ? "good" : report.position <= 20 ? "ok" : "bad";
  const page = report.position <= 10 ? 1 : Math.ceil(report.position / 10);
  return {
    label: `${report.position}`,
    tone,
    text: `Position ${report.position} on page ${page} for “${report.keyword}”.`,
  };
}

export default function RankExperience() {
  const [url, setUrl] = useState("");
  const [keyword, setKeyword] = useState("");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [country, setCountry] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [step, setStep] = useState(0);

  async function runInBrowser(cleanUrl: string, cleanKeyword: string) {
    const { runBrowserRank } = await import("@/lib/rank/browser");
    const result = await runBrowserRank(cleanUrl, cleanKeyword, { device, country });
    if (result.ok) setState({ kind: "done", report: result.report });
    else setState({ kind: "error", message: result.error });
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
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);

    try {
      const res = await fetch("/api/rank", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: cleanUrl, keyword: cleanKeyword, demo, device, country }),
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

      setState({ kind: "error", message: data.error ?? "The ranking check failed." });
    } catch {
      clearInterval(timer);
      setState({ kind: "loading", mode: "browser" });
      await runInBrowser(cleanUrl, cleanKeyword);
    }
  }

  const info = state.kind === "done" ? positionInfo(state.report) : null;

  return (
    <div className="rank-tool">
      <div className="rt-container">
        <nav className="rt-breadcrumb">
          <a href="/">Home</a> <span>›</span> <span>Free SEO tools</span> <span>›</span>{" "}
          <span className="rt-current">Ranking Check</span>
        </nav>

        <header className="rt-head">
          <h1>Ranking Check</h1>
          <p>
            Find out where your website ranks in the search results for any keyword — free, in
            seconds. Enter a search term and (optionally) your domain.
          </p>
        </header>

        <form
          className="rt-card rt-form"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className="rt-row">
            <label className="rt-field">
              <span className="rt-label">
                Search term <em>*</em>
              </span>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. hsn code finder"
                required
              />
            </label>
            <label className="rt-field">
              <span className="rt-label">Website (optional)</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="e.g. www.hsncodefinder.me"
              />
            </label>
          </div>

          <div className="rt-row rt-row-bottom">
            <div className="rt-field">
              <span className="rt-label">Device</span>
              <div className="rt-segment" role="group" aria-label="Device">
                <button
                  type="button"
                  className={device === "desktop" ? "is-on" : ""}
                  onClick={() => setDevice("desktop")}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  className={device === "mobile" ? "is-on" : ""}
                  onClick={() => setDevice("mobile")}
                >
                  Mobile
                </button>
              </div>
            </div>

            <label className="rt-field">
              <span className="rt-label">Country</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)}>
                {COUNTRIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="rt-field rt-submit">
              <button className="rt-btn" type="submit" disabled={state.kind === "loading"}>
                {state.kind === "loading" ? "Checking…" : "Check ranking"}
              </button>
              <button className="rt-link" type="button" onClick={() => run(true)}>
                Sample result
              </button>
            </div>
          </div>
        </form>

        {state.kind === "loading" && (
          <div className="rt-card rt-loading">
            <div className="spinner" />
            <div>
              <strong>Checking “{keyword || "your keyword"}”…</strong>
              <p>
                {STEPS[step]}
                {state.mode === "browser" && " (running in your browser)"}
              </p>
              <div className="loading-bar">
                <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="rt-card rt-error">
            <h2>Check failed</h2>
            <p>{state.message}</p>
            <button className="rt-btn" type="button" onClick={() => run()}>
              Try again
            </button>
          </div>
        )}

        {state.kind === "done" && info && (
          <>
            {state.report.demo && (
              <p className="rt-notice">
                <strong>Sample result.</strong> The page is a bundled demo fixture and the result
                list is illustrative — live checks fetch your real page and real search results.
              </p>
            )}

            <section className="rt-card rt-summary">
              <div className={`rt-pos ${info.tone}`}>
                <span className="rt-pos-num">{info.label}</span>
                <span className="rt-pos-cap">Position</span>
              </div>
              <div className="rt-summary-body">
                <h2>{state.report.hostname}</h2>
                <p className="rt-summary-line">{info.text}</p>
                <div className="rt-meta">
                  <span>
                    Keyword score <strong>{state.report.keywordScore}/100</strong>
                  </span>
                  <span>
                    Words <strong>{state.report.page.words}</strong>
                  </span>
                  <span>
                    Headings <strong>{state.report.page.headings}</strong>
                  </span>
                  <span>
                    Images <strong>{state.report.page.images}</strong>
                  </span>
                  <span>
                    Checked <strong>{new Date(state.report.fetchedAt).toLocaleTimeString()}</strong>
                  </span>
                </div>
                <div className="rt-progress">
                  <span style={{ width: `${state.report.keywordScore}%` }} />
                </div>
                <div className="rt-summary-actions">
                  <a
                    className="rt-btn"
                    href={`/audit?url=${encodeURIComponent(state.report.finalUrl)}&run=1`}
                  >
                    Run full SEO audit →
                  </a>
                  <a
                    className="rt-btn rt-btn-ghost"
                    href={state.report.finalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    Open page ↗
                  </a>
                </div>
              </div>
            </section>

            <section className="rt-card">
              <h2 className="rt-h2">How your page appears in the results</h2>
              <div className="rt-snippet">
                <span className="rt-snippet-url">{state.report.snippet.url}</span>
                <span className="rt-snippet-title">{state.report.snippet.title}</span>
                <span className="rt-snippet-desc">{state.report.snippet.description}</span>
              </div>
            </section>

            <section className="rt-card">
              <h2 className="rt-h2">
                Search results for “{state.report.keyword}”
                <span className="rt-h2-note">
                  {state.report.serpAvailable
                    ? `top ${state.report.serp.length} results`
                    : "results unavailable"}
                </span>
              </h2>

              {state.report.serpAvailable ? (
                <div className="rt-table-wrap">
                  <table className="rt-table">
                    <thead>
                      <tr>
                        <th className="rt-col-pos">#</th>
                        <th>Page</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.report.serp.map((row) => (
                        <tr key={`${row.position}-${row.url}`} className={row.isTarget ? "is-target" : ""}>
                          <td className="rt-col-pos">{row.position}</td>
                          <td>
                            <a
                              className="rt-res-title"
                              href={row.url}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {row.title}
                            </a>
                            <div className="rt-res-url">
                              {row.hostname}
                              {row.isTarget && <span className="rt-you">Your site</span>}
                            </div>
                            {row.snippet && <p className="rt-res-snippet">{row.snippet}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rt-muted">
                  The search engine didn&apos;t return results for this check — most often a rate
                  limit or a blocked request. The keyword analysis below still applies.
                </p>
              )}
            </section>

            <section className="rt-card">
              <h2 className="rt-h2">
                Keyword optimisation
                <span className="rt-h2-note">
                  {state.report.checks.filter((c) => c.status === "pass").length}/
                  {state.report.checks.length} checks passed
                </span>
              </h2>

              <ul className="rt-checks">
                {state.report.checks.map((check) => (
                  <li key={check.id} className={`rt-check ${check.status}`}>
                    <span className="rt-mark" aria-hidden>
                      {check.status === "pass" ? "✓" : check.status === "warn" ? "!" : "✕"}
                    </span>
                    <div className="rt-check-body">
                      <strong>{check.label}</strong>
                      <p>{check.detail}</p>
                      {check.status !== "pass" && <p className="rt-fix">Fix: {check.fix}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <ul className="rt-notes">
              {state.report.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </>
        )}

        {state.kind === "idle" && (
          <>
            <section className="rt-card rt-about">
              <h2 className="rt-h2">What the ranking check tells you</h2>
              <div className="rt-about-grid">
                <div>
                  <h3>Your live position</h3>
                  <p>
                    We pull the current top 30 results for the keyword, find your domain among them
                    and show it highlighted in the list — with the title and description searchers
                    actually see.
                  </p>
                </div>
                <div>
                  <h3>Keyword optimisation</h3>
                  <p>
                    Twelve on-page checks: title, meta description, H1, first 100 words, URL slug,
                    keyword density, subheadings, image alt text, content length, internal anchors
                    and structured data.
                  </p>
                </div>
                <div>
                  <h3>A concrete next step</h3>
                  <p>
                    Every failed check ships with the fix. One click takes you into the full
                    claude-seo audit: technical SEO, schema, AI search readiness, images and an
                    action plan.
                  </p>
                </div>
              </div>
            </section>

            <section className="rt-card rt-faq">
              <h2 className="rt-h2">Frequently asked questions</h2>
              <details>
                <summary>Where do the positions come from?</summary>
                <p>
                  DuckDuckGo&apos;s public results page, filtered by the country you choose. Google
                  ordering can differ by a few places. For exact Google positions at scale, plug a
                  SERP API into <code>lib/rank/serp.ts</code>.
                </p>
              </details>
              <details>
                <summary>Do I need an account?</summary>
                <p>No. The check runs immediately, nothing is stored and no signup is required.</p>
              </details>
              <details>
                <summary>Why is my website not in the list?</summary>
                <p>
                  Either it doesn&apos;t rank in the top 30 for that term yet, or the URL you entered
                  is a subpage while a different page of your site ranks. Try the exact URL that
                  should rank, or a shorter keyword.
                </p>
              </details>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
