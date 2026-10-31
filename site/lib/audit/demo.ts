import { parsePage } from "./crawl";
import type { SiteSnapshot } from "./types";

// A realistic snapshot used when live crawling isn't possible (offline sandbox,
// blocked host, or an explicit "show me a sample" click). The report is produced
// by the same engine as a live audit, so every number here is real output.

const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sco Staking — Earn 12% APY on Tokenized Sco Rewards | DeFi Staking Platform</title>
<link rel="stylesheet" href="/_next/static/css/app.css" />
<script src="https://www.googletagmanager.com/gtag/js?id=G-DEMO123" defer></script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Sco Staking","url":"https://scostaking.example","logo":"https://scostaking.example/logo.png","sameAs":["https://x.com/scostaking"]}
</script>
<meta property="og:title" content="Sco Staking" />
<meta property="og:description" content="Stake Sco tokens and earn rewards." />
<meta name="twitter:card" content="summary_large_image" />
</head>
<body>
<header><nav><a href="/">Home</a> <a href="/stake">Stake</a> <a href="/rewards">Rewards</a> <a href="/docs">Docs</a> <a href="/about">About</a> <a href="/contact">Contact</a></nav></header>
<main>
<article>
<h1>Stake Sco tokens, earn 12% APY</h1>
<p>Sco Staking is a non-custodial staking app for the Sco network. Deposit Sco, pick a validator, and claim rewards without giving up custody of your keys.</p>
<h2>How staking works</h2>
<p>Choose a validator from the dashboard and delegate. Rewards accrue every epoch and can be claimed at any time. Unbonding takes 21 days, in line with the network's proof-of-stake rules.</p>
<h2>What are the risks?</h2>
<p>Slashing can occur if a validator misbehaves. APY changes with network inflation. Smart contract risk exists, so only stake what you can afford to lose.</p>
<h3>Validator selection</h3>
<p>We surface uptime, commission and slashing history for every validator so you can compare before delegating.</p>
<h4>Commission</h4>
<p>Commission is the share of rewards the validator keeps, usually between 5% and 10%.</p>
<h2>Fees</h2>
<p>The protocol fee is 2% of rewards. There is no deposit or withdrawal fee. Gas is paid on the Sco network at roughly one cent per transaction.</p>
<img src="/hero-validators.jpg" alt="Validator dashboard" width="1200" height="600" loading="eager" />
<img src="/rewards-chart.png" alt="" width="800" height="400" loading="lazy" />
<img src="/staking-flow.png" width="640" height="360" loading="lazy" />
<img src="/icon-wallet.png" alt="Wallet" width="48" height="48" loading="lazy" />
<img src="/icon-shield.png" width="48" height="48" loading="lazy" />
<img src="/screenshot-1.jpg" alt="Stake screen" width="1000" height="560" loading="lazy" />
<p>Read the <a href="https://sco.network/whitepaper.pdf">network whitepaper</a> and the <a href="https://docs.sco.network">validator docs</a> for the full mechanics.</p>
</article>
</main>
<footer><p>© 2026 Sco Staking · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p></footer>
</body>
</html>`;

const DEMO_ROBOTS = `# scostaking.example
User-agent: *
Allow: /

Sitemap: https://scostaking.example/sitemap.xml

User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Disallow: /
`;

const DEMO_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${["/", "/stake", "/rewards", "/validators", "/docs", "/about", "/contact", "/terms", "/privacy", "/blog", "/blog/what-is-staking", "/blog/slashing-explained"]
  .map((path) => `  <url><loc>https://scostaking.example${path}</loc></url>`)
  .join("\n")}
</urlset>`;

export function demoSite(url = "https://scostaking.example"): SiteSnapshot {
  const finalUrl = url.startsWith("http") ? url : `https://${url}`;
  const homepage = parsePage({
    status: 200,
    finalUrl,
    redirects: 1,
    html: DEMO_HTML,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0" },
    ttfbMs: 412,
    bytes: 18_940,
  });

  return {
    requestedUrl: finalUrl,
    origin: new URL(finalUrl).origin,
    homepage,
    robotsTxt: DEMO_ROBOTS,
    sitemapXml: DEMO_SITEMAP,
    llmsTxt: null,
    extraPages: [
      { url: `${finalUrl.replace(/\/$/, "")}/stake`, status: 200, title: "Stake Sco — Sco Staking", description: null },
      { url: `${finalUrl.replace(/\/$/, "")}/docs`, status: 200, title: "Docs — Sco Staking", description: "Staking documentation." },
      { url: `${finalUrl.replace(/\/$/, "")}/about`, status: 200, title: "About — Sco Staking", description: null },
      { url: `${finalUrl.replace(/\/$/, "")}/blog`, status: 404, title: null, description: null },
    ],
    fetchedAt: new Date().toISOString(),
    demo: true,
    notes: [
      "Sample snapshot: the engine ran against a bundled fixture, not a live crawl.",
      "Live audits fetch the homepage plus up to four internal pages, robots.txt, sitemap.xml and llms.txt.",
    ],
  };
}
