// Helpers that make a GitHub markdown file behave like a real docs page:
// relative links resolve inside the site, images resolve against the repo.

export type LinkContext = {
  owner: string;
  repo: string;
  branch: string;
  /** directory of the current file, e.g. "docs/getting-started" */
  dir: string;
  /** lowercase set of markdown paths that exist in the repo */
  docs: Set<string>;
};

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function resolvePath(fromDir: string, href: string): string {
  const stack = fromDir ? fromDir.split("/") : [];
  for (const part of href.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

export function stripMarkdownExt(path: string): string {
  return path.replace(/\.(md|mdx|markdown)$/i, "");
}

export function docHref(owner: string, repo: string, filePath: string): string {
  return `/r/${owner}/${repo}/${stripMarkdownExt(filePath)}`;
}

export function rawUrl(owner: string, repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

/**
 * Turn a link found inside `filePath` into one that works on this site.
 * Markdown files become internal docs routes, other repo files go to GitHub.
 */
export function rewriteLink(href: string, ctx: LinkContext): string {
  if (!href || href.startsWith("#")) return href ?? "";
  if (ABSOLUTE.test(href)) return href;

  const [rawTarget, hash = ""] = href.split("#");
  const [pathPart, query = ""] = rawTarget.split("?");
  if (!pathPart) return href;

  const resolved = resolvePath(ctx.dir, pathPart);
  const suffix = hash ? `#${hash}` : "";
  const qs = query ? `?${query}` : "";

  if (ctx.docs.has(resolved.toLowerCase())) {
    return `${docHref(ctx.owner, ctx.repo, resolved)}${suffix}`;
  }
  // markdown file that does not exist yet -> keep the reader on GitHub
  if (/\.(md|mdx|markdown)$/i.test(resolved)) {
    return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.branch}/${resolved}${suffix}`;
  }
  return `https://github.com/${ctx.owner}/${ctx.repo}/blob/${ctx.branch}/${resolved}${qs}${suffix}`;
}

export function rewriteImage(src: string, ctx: LinkContext): string {
  if (!src || ABSOLUTE.test(src) || src.startsWith("/")) return src;
  const [pathPart, hash = ""] = src.split("#");
  const resolved = resolvePath(ctx.dir, pathPart.split("?")[0]);
  return rawUrl(ctx.owner, ctx.repo, ctx.branch, resolved) + (hash ? `#${hash}` : "");
}

export function dirOf(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

export function titleOf(path: string): string {
  const base = path.split("/").pop() ?? path;
  const clean = stripMarkdownExt(base).replace(/[-_]+/g, " ");
  if (/^readme$/i.test(clean)) return "Overview";
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strip a leading `# Title` line so the page can render its own header. */
export function stripLeadingTitle(markdown: string): { title: string | null; body: string } {
  const match = markdown.match(/^\s*#\s+(.+?)\s*$/m);
  if (!match || match.index !== 0) return { title: null, body: markdown };
  return {
    title: match[1].trim(),
    body: markdown.slice(match[0].length).replace(/^\s*\n/, ""),
  };
}

export function readingTime(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < day) return `${Math.round(diff / 3_600_000)} h ago`;
  if (diff < 30 * day) return `${Math.round(diff / day)} d ago`;
  if (diff < 365 * day) return `${Math.round(diff / (30 * day))} mo ago`;
  return `${Math.round(diff / (365 * day))} y ago`;
}
