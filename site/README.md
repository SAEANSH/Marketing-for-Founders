# RepoDocs + claude-seo audit engine

Two things live in this folder:

1. **RepoDocs** — turn any GitHub user/org's repositories into a documentation website.
   Every `README.md` and every markdown file under `docs/` becomes a page, with a sidebar,
   table of contents, previous/next pagination and rewritten links/images.

2. **The SEO audit engine** — a working implementation of the audit framework from
   [`AgriciDaniel/claude-seo`](https://github.com/AgriciDaniel/claude-seo) (MIT). A visitor
   pastes their URL, the server crawls it, and the result is shown as a scored, prioritized
   report in the style of the claude-seo `audit-data.json` envelope.

## Run it

```bash
cd site
npm install
npm run dev          # http://localhost:3000
```

Environment (copy `.env.example` → `.env.local`):

| Variable | What it does |
|---|---|
| `GITHUB_OWNER` | Default owner shown on the homepage |
| `GITHUB_TOKEN` | Optional. Raises the GitHub API limit from 60 to 5,000 requests/hour |
| `GITHUB_REVALIDATE` | Cache seconds before GitHub is re-read (default 300) |
| `NEXT_PUBLIC_SITE_NAME` | Brand name in the header/title |

## The ranking check

`POST /api/rank` with `{ "url": "https://site.com/page", "keyword": "my keyword" }`.

It fetches the page, pulls the live top 30 results for the keyword, finds the target domain's
position, and scores 12 on-page keyword factors (title, meta description, H1, first 100 words,
URL slug, density, subheadings, alt text, length, internal anchors, schema).

Results come from DuckDuckGo's public HTML results. Google's ordering differs, and scraping
search engines at scale is fragile — for production traffic swap `lib/rank/serp.ts` for a paid
SERP API (DataForSEO, SerpApi, Seobility). The rest of the report doesn't change.

`{ "demo": true }` returns a bundled sample so the UI can be demoed without network access.

## The audit engine

`POST /api/audit` with `{ "url": "https://example.com" }`.

Pipeline (`lib/audit/`):

```
crawl.ts    URL safety (SSRF guard, same rules as claude-seo's url_safety.py)
            → fetch with redirects + timeout → parse HTML with cheerio
            → fetch robots.txt, sitemap.xml, llms.txt → sample 4 internal pages
checks.ts   45 checks across the 7 claude-seo categories, weighted exactly like
            skills/seo-audit/SKILL.md: Technical 22%, Content 23%, On-Page 20%,
            Schema 10%, Performance 10%, AI Search 10%, Images 5%
types.ts    the audit envelope (categories → findings → action plan)
demo.ts     a bundled fixture so the UI can be demoed without network access
```

Every finding carries `evidence`, `why` and `fix`, and the report ends with the same
four-phase action plan the plugin produces (Critical → High-impact → Content → Monitoring).

Scoring: each check has a severity weight and a status (`pass` 1.0, `warn` 0.6, `fail` 0).
A category is the weighted average of its checks; the health score is the weighted average of
the categories using the weights above.

> Performance figures are **estimated** from the HTML response (weight, TTFB, blocking
> resources). Real Lighthouse/CrUX field data needs the plugin's Google APIs extensions.

## Deploying

Any Node host works (Vercel, Fly, Docker). Set `GITHUB_TOKEN` in the host's dashboard —
never commit it. The audit endpoint uses the Node runtime (it needs DNS lookups and the
`fetch` API) and should sit behind your own rate limit / WAF in production; the route ships
with a small in-memory limiter (20 audits/hour/IP) as a starting point.

## Notes for the Arena sandbox

The preview sandbox can only reach an allow-listed set of hosts, so live crawling of arbitrary
sites returns a `network` error — the UI offers the bundled sample report instead. Node's TLS
also needs the sandbox CA in the preview here:

```bash
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npm run dev
```

None of that applies to a normal deployment.
