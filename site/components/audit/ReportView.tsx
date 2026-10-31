"use client";

import { useMemo, useState } from "react";
import type { ActionItem, CategoryKey, Check, Report, Severity } from "@/lib/audit/types";

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

const VERDICT = (score: number) => {
  if (score >= 85) return "Strong foundation. Fix the few gaps below and you're ahead of most of your niche.";
  if (score >= 70) return "Solid, but several high-impact issues are holding back rankings and AI citations.";
  if (score >= 55) return "Real gaps in technical hygiene and content signals. The action plan below is worth a week of work.";
  return "This site is leaving most of its search visibility on the table. Start with Phase 1.";
};

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color = score >= 80 ? "#16a34a" : score >= 60 ? "#eab308" : score >= 40 ? "#f97316" : "#ef4444";

  return (
    <div className="score-ring">
      <svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label={`Score ${score} out of 100`}>
        <circle cx="90" cy="90" r={radius} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 90 90)"
        />
      </svg>
      <div className="score-ring-inner">
        <span className="score-number">{score}</span>
        <span className="score-out">/100</span>
        <span className="score-grade" style={{ color }}>
          Grade {grade}
        </span>
      </div>
    </div>
  );
}

function SiteShot({ report }: { report: Report }) {
  const shots = [
    report.screenshot,
    `https://image.thum.io/get/width/1200/crop/800/noanimate/${report.finalUrl}`,
  ].filter(Boolean) as string[];
  const [index, setIndex] = useState(0);

  if (shots.length === 0 || index >= shots.length) return null;

  return (
    <figure className="site-shot">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shots[index]}
        alt={`Screenshot of ${report.hostname}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setIndex((i) => i + 1)}
      />
      <figcaption>
        Live render of <strong>{report.hostname}</strong> ·{" "}
        <a href={report.finalUrl} target="_blank" rel="noreferrer noopener">
          open the site ↗
        </a>
      </figcaption>
    </figure>
  );
}

function CategoryCard({ cat }: { cat: Report["categories"][number] }) {
  const tone = cat.score >= 80 ? "good" : cat.score >= 60 ? "ok" : "bad";
  return (
    <div className="cat-card">
      <div className="cat-head">
        <span className="cat-name">{cat.label}</span>
        <span className={`cat-score ${tone}`}>{cat.score}</span>
      </div>
      <div className="cat-bar">
        <span className={tone} style={{ width: `${cat.score}%` }} />
      </div>
      <p className="cat-blurb">{cat.blurb}</p>
      <div className="cat-counts">
        <span className="tone-good">✓ {cat.passed}</span>
        <span className="tone-ok">! {cat.warnings}</span>
        <span className="tone-bad">✕ {cat.failed}</span>
      </div>
    </div>
  );
}

function FindingRow({ check, categoryLabel }: { check: Check; categoryLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`finding sev-${check.severity}`}>
      <button className="finding-head" type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`sev-dot ${check.status}`} />
        <span className="finding-title">{check.title}</span>
        <span className="finding-cat">{categoryLabel}</span>
        <span className={`badge ${check.severity}`}>{SEVERITY_LABEL[check.severity]}</span>
        <span className="chev">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="finding-body">
          <p className="evidence">
            <strong>What we found:</strong> {check.evidence}
          </p>
          <p>
            <strong>Why it matters:</strong> {check.why}
          </p>
          <p className="fix">
            <strong>How to fix:</strong> {check.fix}
          </p>
        </div>
      )}
    </div>
  );
}

function PlanItem({ item }: { item: ActionItem }) {
  return (
    <li>
      <span className={`badge ${item.severity}`}>{SEVERITY_LABEL[item.severity]}</span>
      <div>
        <strong>{item.title}</strong>
        <p>{item.fix}</p>
      </div>
    </li>
  );
}

export default function ReportView({ report, onRerun }: { report: Report; onRerun: (url: string) => void }) {
  const [filter, setFilter] = useState<"all" | Severity>("all");

  const findings = useMemo(() => {
    const all = report.categories.flatMap((c) =>
      c.checks
        .filter((ch) => ch.status === "fail" || ch.status === "warn")
        .map((ch) => ({ check: ch, categoryLabel: c.label })),
    );
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return all.sort(
      (a, b) =>
        order[a.check.severity] - order[b.check.severity] ||
        (a.check.status === "fail" ? -1 : 1),
    );
  }, [report]);

  const visible = filter === "all" ? findings : findings.filter((f) => f.check.severity === filter);

  function download() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${report.hostname}-seo-audit.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const totalIssues = report.categories.reduce((s, c) => s + c.failed + c.warnings, 0);
  const totalChecks = report.categories.reduce((s, c) => s + c.checks.length, 0);

  return (
    <div className="report">
      {report.demo && (
        <div className="report-banner">
          <strong>Sample report.</strong> This ran against the bundled fixture (a fictional
          “Sco Staking” site) because live crawling isn&apos;t available from this sandbox. The
          scoring engine is the same one a real audit uses.
        </div>
      )}

      <div className="report-top">
        <div>
          <p className="report-kicker">Audit complete · {new Date(report.fetchedAt).toLocaleString()}</p>
          <h2 className="report-host">
            {report.hostname}
            {report.demo && <span className="chip" style={{ marginLeft: 10 }}>sample</span>}
          </h2>
          {report.title && <p className="report-title">{report.title}</p>}
        </div>
        <div className="report-actions">
          <button className="btn ghost" type="button" onClick={download}>
            Download JSON
          </button>
          <button className="btn" type="button" onClick={() => onRerun(report.url)}>
            Re-run audit
          </button>
        </div>
      </div>

      <SiteShot report={report} />

      {report.notes.length > 0 && (
        <ul className="report-notes">
          {report.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <div className="score-hero">
        <ScoreRing score={report.score} grade={report.grade} />
        <div className="score-copy">
          <h3>SEO Health Score</h3>
          <p>{VERDICT(report.score)}</p>
          <div className="score-stats">
            <span>
              <strong>{totalIssues}</strong> issues
            </span>
            <span>
              <strong>{totalChecks}</strong> checks run
            </span>
            <span>
              <strong>{report.stats.pagesScanned}</strong> page(s) scanned
            </span>
            <span>
              <strong>{report.stats.ttfbMs} ms</strong> response
            </span>
          </div>
        </div>
      </div>

      {report.quickWins.length > 0 && (
        <section className="report-section">
          <h3 className="section-title">Fix these first</h3>
          <div className="quickwins">
            {report.quickWins.map((item, i) => (
              <div className="quickwin" key={item.id}>
                <span className="qw-index">{i + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.fix}</p>
                  <span className="qw-cat">{item.categoryLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="report-section">
        <h3 className="section-title">Category scores</h3>
        <div className="cat-grid">
          {report.categories.map((cat) => (
            <CategoryCard key={cat.key} cat={cat} />
          ))}
        </div>
      </section>

      <section className="report-section">
        <div className="findings-head">
          <h3 className="section-title">Findings</h3>
          <div className="filter-row">
            <button
              className={`filter-pill ${filter === "all" ? "active" : ""}`}
              type="button"
              onClick={() => setFilter("all")}
            >
              All {findings.length}
            </button>
            {SEVERITIES.map((sev) => {
              const count = findings.filter((f) => f.check.severity === sev).length;
              if (!count) return null;
              return (
                <button
                  key={sev}
                  className={`filter-pill ${filter === sev ? "active" : ""}`}
                  type="button"
                  onClick={() => setFilter(sev)}
                >
                  {SEVERITY_LABEL[sev]} {count}
                </button>
              );
            })}
          </div>
        </div>

        <div className="findings">
          {visible.length === 0 ? (
            <p className="empty">Nothing at this severity — nice.</p>
          ) : (
            visible.map(({ check, categoryLabel }) => (
              <FindingRow key={check.id} check={check} categoryLabel={categoryLabel} />
            ))
          )}
        </div>
      </section>

      <section className="report-section">
        <h3 className="section-title">Action plan</h3>
        <div className="plan">
          {report.actionPlan.map((phase) => (
            <div className="plan-phase" key={phase.phase}>
              <div className="plan-marker" />
              <div className="plan-body">
                <div className="plan-head">
                  <h4>{phase.phase}</h4>
                  <span className="chip">{phase.timeframe}</span>
                </div>
                {phase.items.length === 0 ? (
                  <p className="muted">Nothing outstanding in this phase.</p>
                ) : (
                  <ul>
                    {phase.items.map((item) => (
                      <PlanItem key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="report-credit">
        Checks and scoring weights follow the{" "}
        <a href="https://github.com/AgriciDaniel/claude-seo" target="_blank" rel="noreferrer noopener">
          claude-seo
        </a>{" "}
        audit framework (MIT, by Agrici Daniel). Performance figures are estimated from the HTML
        response — they are not field Core Web Vitals.
      </p>
    </div>
  );
}
