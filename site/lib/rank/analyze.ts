import type { PageSnapshot } from "@/lib/audit/types";

export type SerpResult = {
  position: number;
  url: string;
  hostname: string;
  title: string;
  snippet: string;
  isTarget: boolean;
};

export type KeywordCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  fix: string;
};

export type RankReport = {
  url: string;
  finalUrl: string;
  hostname: string;
  keyword: string;
  position: number | null;
  serpAvailable: boolean;
  serp: SerpResult[];
  keywordScore: number;
  checks: KeywordCheck[];
  snippet: { title: string; url: string; description: string };
  page: {
    title: string | null;
    description: string | null;
    h1: string | null;
    words: number;
    images: number;
    headings: number;
  };
  mode: "server" | "browser";
  fetchedAt: string;
  notes: string[];
};

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^www\./, "").toLowerCase();
  }
}

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = norm(haystack);
  const n = norm(needle);
  let count = 0;
  let index = h.indexOf(n);
  while (index !== -1) {
    count++;
    index = h.indexOf(n, index + n.length);
  }
  return count;
}

/** Keyword-level on-page analysis — the part that never needs a SERP API. */
export function analyzeKeyword(page: PageSnapshot, keyword: string): KeywordCheck[] {
  const kw = norm(keyword);
  const words = page.text.split(/\s+/).filter(Boolean);
  const first100 = words.slice(0, 100).join(" ");
  const title = page.title ?? "";
  const description = page.description ?? "";
  const h1 = page.h1s[0] ?? "";
  const headings = page.headings.filter((h) => h.level >= 2).map((h) => h.text).join(" | ");
  const occurrences = countOccurrences(page.text, kw);
  const density = words.length ? (occurrences * kw.split(" ").length * 100) / words.length : 0;
  const path = (() => {
    try {
      return new URL(page.finalUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const checks: KeywordCheck[] = [
    {
      id: "title",
      label: "Keyword in the title tag",
      status: countOccurrences(title, kw) > 0 ? "pass" : "fail",
      detail: title ? `Title: “${title}”` : "The page has no title tag.",
      fix: `Put “${keyword}” in the title, ideally near the front, inside a 30–60 character title.`,
    },
    {
      id: "title-front",
      label: "Keyword at the start of the title",
      status: norm(title).startsWith(kw) ? "pass" : countOccurrences(title, kw) > 0 ? "warn" : "fail",
      detail: norm(title).startsWith(kw)
        ? "The title opens with the keyword."
        : "The keyword appears late in the title (or not at all).",
      fix: `Rewrite the title as “${keyword} — <benefit> | <brand>”.`,
    },
    {
      id: "description",
      label: "Keyword in the meta description",
      status: countOccurrences(description, kw) > 0 ? "pass" : description ? "warn" : "fail",
      detail: description ? `${description.length} characters.` : "No meta description on the page.",
      fix: `Write a 140–155 character description that contains “${keyword}” naturally and ends with a call to action.`,
    },
    {
      id: "h1",
      label: "Keyword in the H1",
      status: countOccurrences(h1, kw) > 0 ? "pass" : h1 ? "warn" : "fail",
      detail: h1 ? `H1: “${h1}”` : "No H1 found.",
      fix: `Make the single H1 a natural sentence containing “${keyword}”.`,
    },
    {
      id: "first-100",
      label: "Keyword in the first 100 words",
      status: countOccurrences(first100, kw) > 0 ? "pass" : "fail",
      detail: countOccurrences(first100, kw) > 0
        ? "The keyword shows up early in the copy."
        : "The keyword is missing from the opening paragraph.",
      fix: `Mention “${keyword}” within the first sentence or two so the topic is obvious.`,
    },
    {
      id: "url",
      label: "Keyword in the URL",
      status: path.includes(slug(kw)) ? "pass" : "warn",
      detail: `Path: ${path || "/"}`,
      fix: `Use a slug like /${slug(kw)} for the primary landing page.`,
    },
    {
      id: "headings",
      label: "Keyword in H2/H3 subheadings",
      status: countOccurrences(headings, kw) > 0 ? "pass" : "warn",
      detail: countOccurrences(headings, kw) > 0
        ? "At least one subheading carries the keyword."
        : "No subheading mentions the keyword.",
      fix: `Add 1–2 H2s phrased the way people search, e.g. “${keyword}: how it works”.`,
    },
    {
      id: "density",
      label: "Keyword density 0.5–2.5%",
      status: density >= 0.5 && density <= 2.5 ? "pass" : density === 0 ? "fail" : "warn",
      detail: `${occurrences} mention(s), ≈${density.toFixed(2)}% density across ${words.length} words.`,
      fix:
        density === 0
          ? `Use “${keyword}” and its natural variants in the body copy.`
          : density > 2.5
            ? "Ease off — use synonyms and related phrases instead of repeating the exact keyword."
            : "Add one or two more natural mentions in the body.",
    },
    {
      id: "alt",
      label: "Keyword in image alt text",
      status: page.images.some((i) => countOccurrences(i.alt ?? "", kw) > 0) ? "pass" : "warn",
      detail: page.images.length
        ? `${page.images.length} image(s) on the page.`
        : "No images on the page.",
      fix: `Describe one relevant image with alt text that includes “${keyword}”.`,
    },
    {
      id: "length",
      label: "Enough content to rank",
      status: words.length >= 600 ? "pass" : words.length >= 300 ? "warn" : "fail",
      detail: `${words.length} words of visible copy.`,
      fix: "Pages ranking on page 1 usually carry 800+ words with complete answers to the query.",
    },
    {
      id: "internal",
      label: "Internal links use the keyword",
      status: page.links.some((l) => l.internal && countOccurrences(l.text, kw) > 0) ? "pass" : "warn",
      detail: "Checks whether any internal anchor text contains the keyword.",
      fix: `Link to this page from related pages using “${keyword}” as the anchor text.`,
    },
    {
      id: "schema",
      label: "Structured data supporting the topic",
      status: page.jsonLd.length > 0 ? "pass" : "warn",
      detail: page.jsonLd.length ? `${page.jsonLd.length} JSON-LD block(s).` : "No JSON-LD found.",
      fix: "Mark the page up with FAQPage / Article / Product schema so it can win a rich result.",
    },
  ];

  return checks;
}

export function scoreChecks(checks: KeywordCheck[]): number {
  const value = { pass: 1, warn: 0.5, fail: 0 } as const;
  if (checks.length === 0) return 0;
  return Math.round((checks.reduce((sum, c) => sum + value[c.status], 0) / checks.length) * 100);
}

export function buildSnippet(page: PageSnapshot, keyword: string) {
  const title = page.title ?? `${keyword}`;
  const description =
    page.description ??
    `${page.text.slice(0, 155)}…`;
  const url = page.finalUrl
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, " › ");
  return { title, url, description: description.slice(0, 160) };
}

/** Mark which SERP rows belong to the audited domain and find its position. */
export function decorateSerp(results: SerpResult[], targetHost: string): { serp: SerpResult[]; position: number | null } {
  const serp = results.map((r) => ({ ...r, isTarget: r.hostname === targetHost }));
  const hit = serp.find((r) => r.isTarget);
  return { serp, position: hit?.position ?? null };
}
