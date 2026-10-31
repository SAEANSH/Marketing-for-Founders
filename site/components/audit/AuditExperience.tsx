"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Report } from "@/lib/audit/types";
import ReportView from "./ReportView";

type State =
  | { kind: "idle" }
  | { kind: "loading"; url: string; mode: "server" | "browser" }
  | { kind: "error"; message: string; reason?: string; url: string }
  | { kind: "done"; report: Report };

const SERVER_STEPS = [
  "Resolving the URL and checking it's safe to crawl…",
  "Fetching the homepage HTML…",
  "Reading robots.txt, sitemap.xml and llms.txt…",
  "Parsing titles, headings, links and images…",
  "Validating JSON-LD structured data…",
  "Running 45 checks across 7 categories…",
  "Scoring against the claude-seo audit framework…",
];

const BROWSER_STEPS = [
  "Server can't reach the site from here — switching to your browser…",
  "Fetching the page through a public CORS proxy…",
  "Reading robots.txt, sitemap.xml and llms.txt…",
  "Parsing the HTML in your browser…",
  "Validating JSON-LD structured data…",
  "Running 45 checks across 7 categories…",
  "Scoring against the claude-seo audit framework…",
];

export default function AuditExperience() {
  const params = useSearchParams();
  const initialUrl = params.get("url") ?? "";
  const autoRun = params.get("run") === "1";

  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [step, setStep] = useState(0);
  const started = useRef(false);

  async function runInBrowser(target: string) {
    const { runBrowserAudit } = await import("@/lib/audit/browser");
    const result = await runBrowserAudit(target);
    if (result.ok) {
      setState({ kind: "done", report: result.report });
    } else {
      setState({ kind: "error", message: result.error, reason: "network", url: target });
    }
  }

  async function run(target: string, demo = false, displayUrl?: string) {
    const clean = target.trim();
    if (!clean && !demo) return;

    setState({ kind: "loading", url: displayUrl ?? clean, mode: "server" });
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, SERVER_STEPS.length - 1)), 700);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: clean || undefined, demo }),
      });
      const data = await res.json();
      clearInterval(timer);

      if (res.ok && data.ok) {
        setState({ kind: "done", report: data.report as Report });
        return;
      }

      // A server-side network failure is expected in restricted hosting
      // environments — retry the same audit from the visitor's browser.
      const canRetryInBrowser = !demo && (data.reason === "network" || data.reason === "unknown");
      if (canRetryInBrowser) {
        setState({ kind: "loading", url: clean, mode: "browser" });
        setStep(0);
        const timer2 = setInterval(
          () => setStep((s) => Math.min(s + 1, BROWSER_STEPS.length - 1)),
          800,
        );
        try {
          await runInBrowser(clean);
        } finally {
          clearInterval(timer2);
        }
        return;
      }

      setState({
        kind: "error",
        message: data.error ?? "The audit failed.",
        reason: data.reason,
        url: displayUrl ?? clean,
      });
    } catch {
      clearInterval(timer);
      setState({ kind: "loading", url: clean, mode: "browser" });
      await runInBrowser(clean);
    }
  }

  useEffect(() => {
    if (autoRun && initialUrl && !started.current) {
      started.current = true;
      void run(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, initialUrl]);

  const steps = state.kind === "loading" && state.mode === "browser" ? BROWSER_STEPS : SERVER_STEPS;

  return (
    <div className="audit-page">
      <section className="audit-hero">
        <div className="container">
          <span className="eyebrow">
            <span className="dot" /> SEO audit engine · powered by claude-seo
          </span>
          <h1>
            Paste your URL.
            <br />
            Get a <em>real</em> SEO audit.
          </h1>
          <p className="lead">
            The site fetches your page, reads your <code>robots.txt</code>, <code>sitemap.xml</code>{" "}
            and <code>llms.txt</code>, parses the markup, and scores 45 checks across the seven
            categories the open-source{" "}
            <a
              href="https://github.com/AgriciDaniel/claude-seo"
              target="_blank"
              rel="noreferrer noopener"
            >
              claude-seo
            </a>{" "}
            framework uses — then hands you a prioritized action plan.
          </p>

          <form
            className="audit-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(url);
            }}
          >
            <div className="audit-input-wrap">
              <span className="input-icon">https://</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="yourwebsite.com"
                aria-label="Website URL to audit"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <button className="btn btn-lg" type="submit" disabled={state.kind === "loading"}>
              {state.kind === "loading" ? "Auditing…" : "Run free audit →"}
            </button>
          </form>

          <p className="audit-hint">
            No signup. Nothing stored. Or{" "}
            <button className="linkbtn" type="button" onClick={() => run("", true, "scostaking.example")}>
              see a sample report
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
                Auditing {state.url}
                {state.mode === "browser" && <span className="chip" style={{ marginLeft: 8 }}>browser mode</span>}
              </p>
              <p className="loading-step">{steps[step]}</p>
              <div className="loading-bar">
                <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {state.kind === "error" && (
          <div className="audit-error">
            <h3>Couldn&apos;t audit that URL</h3>
            <p>{state.message}</p>
            {state.reason === "network" && (
              <p className="muted">
                The audit ran twice: once from this server and once from your browser through a
                public proxy. If both failed, the site is most likely blocking automated requests
                (Cloudflare, Vercel bot protection, or a WAF rule) or requires JavaScript to render.
              </p>
            )}
            <div className="audit-error-actions">
              <button className="btn" type="button" onClick={() => run(url)}>
                Try again
              </button>
              <button className="btn ghost" type="button" onClick={() => run(state.url, true, state.url)}>
                Run sample audit
              </button>
            </div>
          </div>
        )}

        {state.kind === "done" && <ReportView report={state.report} onRerun={(u) => run(u)} />}

        {state.kind === "idle" && (
          <div className="audit-idle">
            <h2>What gets checked</h2>
            <div className="idle-grid">
              {[
                ["Technical SEO", "Crawlability, canonicals, robots.txt, sitemaps, mobile viewport, security headers.", "22%"],
                ["Content Quality", "Depth, E-E-A-T signals, freshness, citations, readability, structure.", "23%"],
                ["On-Page SEO", "Title, meta description, headings, internal links, anchor text, social tags.", "20%"],
                ["Schema", "JSON-LD detection, parsing, core entity types, breadcrumbs.", "10%"],
                ["Performance", "Document weight, TTFB, render-blocking resources, script hygiene.", "10%"],
                ["AI Search", "AI crawler access, llms.txt, server-rendered content, entity signals.", "10%"],
                ["Images", "Alt coverage, modern formats, dimensions, lazy loading.", "5%"],
              ].map(([title, body, weight]) => (
                <div className="idle-card" key={title}>
                  <div className="idle-card-head">
                    <strong>{title}</strong>
                    <span className="chip">{weight}</span>
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
