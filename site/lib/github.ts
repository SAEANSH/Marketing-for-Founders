// Thin, cached wrapper around the public GitHub REST API.
// Server-side only: the optional token never reaches the browser.

const API = "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN?.trim();
const REVALIDATE = Number(process.env.GITHUB_REVALIDATE ?? 300);

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

export type Repo = {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics: string[];
  default_branch: string;
  pushed_at: string;
  updated_at: string;
  archived: boolean;
  fork: boolean;
  license: { spdx_id: string | null; name: string } | null;
  owner: { login: string; avatar_url: string };
};

export type TreeEntry = { path: string; type: "blob" | "tree" };

async function gh(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-docs-hub",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(init?.headers ?? {}),
    },
    next: { revalidate: REVALIDATE },
  });
  return res;
}

async function ghJson<T>(path: string, label: string): Promise<T> {
  const res = await gh(path);
  if (res.ok) return (await res.json()) as T;

  const remaining = res.headers.get("x-ratelimit-remaining");
  if (res.status === 403 && remaining === "0") {
    throw new GitHubError(
      429,
      TOKEN
        ? "GitHub API rate limit reached for this token."
        : "GitHub API rate limit reached (60 requests/hour without a token). Add GITHUB_TOKEN to lift it to 5,000/hour.",
    );
  }
  if (res.status === 404) throw new GitHubError(404, `Not found: ${label}`);
  throw new GitHubError(res.status, `GitHub API error ${res.status} for ${label}`);
}

/** All public repos for a user *or* an organisation. */
export async function getRepos(owner: string): Promise<Repo[]> {
  const safe = encodeURIComponent(owner);
  const query = "?per_page=100&sort=updated&type=public";

  let res = await gh(`/users/${safe}/repos${query}`);
  if (res.status === 404) res = await gh(`/orgs/${safe}/repos${query}`);
  if (!res.ok) {
    if (res.status === 404) throw new GitHubError(404, `GitHub user or org not found: ${owner}`);
    throw new GitHubError(res.status, `Could not load repos for ${owner}`);
  }

  const repos = (await res.json()) as Repo[];
  return repos
    .filter((r) => !r.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count);
}

export async function getRepo(owner: string, repo: string): Promise<Repo> {
  return ghJson<Repo>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    `${owner}/${repo}`,
  );
}

export async function getTree(owner: string, repo: string, branch: string): Promise<TreeEntry[]> {
  const data = await ghJson<{ tree: TreeEntry[]; truncated: boolean }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    `${owner}/${repo} tree`,
  );
  return data.tree ?? [];
}

/** Raw text of a single file, decoded from the contents API. */
export async function getFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const data = await ghJson<{ content?: string; encoding?: string; size: number }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
    `${owner}/${repo}/${path}`,
  );
  if (data.encoding === "base64" && data.content) {
    return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  }
  return data.content ?? "";
}

export function hasToken(): boolean {
  return Boolean(TOKEN);
}

/** Pick the repo's readme, case-insensitively, preferring repo root. */
export function findReadme(entries: TreeEntry[]): string | null {
  const candidates = entries.filter(
    (e) => e.type === "blob" && !e.path.includes("/") && /^readme(\.[a-z0-9]+)?$/i.test(e.path),
  );
  const md = candidates.find((e) => /\.(md|mdx|markdown)$/i.test(e.path));
  return (md ?? candidates[0])?.path ?? null;
}

export const MARKDOWN_RE = /\.(md|mdx|markdown)$/i;

/** All markdown files, ordered so the sidebar reads naturally. */
export function markdownFiles(entries: TreeEntry[]): string[] {
  const files = entries
    .filter((e) => e.type === "blob" && MARKDOWN_RE.test(e.path))
    .map((e) => e.path)
    .filter((p) => !/(^|\/)(node_modules|\.github|vendor|third_party)\//.test(p))
    .filter((p) => !/(CHANGELOG|CODE_OF_CONDUCT|SECURITY)\.mdx?$/i.test(p));

  const rank = (p: string) => {
    const depth = p.split("/").length - 1;
    const isReadme = /^readme/i.test(p);
    const inDocs = /^(docs?|documentation|guides?)\//i.test(p);
    if (isReadme && depth === 0) return 0;
    if (inDocs) return 1;
    if (depth === 0) return 2;
    return 3;
  };

  return files.sort((a, b) => {
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const da = a.split("/").length;
    const db = b.split("/").length;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });
}
