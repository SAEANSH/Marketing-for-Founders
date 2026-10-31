import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import DocsSidebar from "@/components/DocsSidebar";
import Markdown from "@/components/Markdown";
import {
  findReadme,
  getFile,
  getRepo,
  getTree,
  GitHubError,
  MARKDOWN_RE,
  markdownFiles,
  type Repo,
} from "@/lib/github";
import { dirOf, docHref, relativeTime, stripLeadingTitle, titleOf } from "@/lib/links";
import { buildToc } from "@/lib/toc";

type Params = { owner: string; repo: string; path?: string[] };

/** `/docs/guide` → `docs/guide.md` (or .mdx, /index.md, /README.md), case-insensitively. */
function resolveDocPath(requested: string, files: string[]): string | null {
  const bases = [
    requested,
    `${requested}.md`,
    `${requested}.mdx`,
    `${requested}/index.md`,
    `${requested}/readme.md`,
  ].map((candidate) => candidate.replace(/^\/+/, "").toLowerCase());

  const hit = files.find((file) => bases.includes(file.toLowerCase()));
  if (hit) return hit;

  // fall back to a case-insensitive match ignoring the extension entirely
  const wanted = requested.replace(/^\/+/, "").toLowerCase();
  return (
    files.find((file) => file.toLowerCase().replace(/\.(md|mdx|markdown)$/, "") === wanted) ?? null
  );
}



export const dynamic = "force-dynamic";

async function loadRepo(owner: string, repo: string) {
  try {
    return { repo: await getRepo(owner, repo), error: null as string | null };
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return { repo: null, error: "404" };
    return {
      repo: null,
      error: err instanceof GitHubError ? err.message : "Could not reach GitHub.",
    };
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo, path } = await params;
  try {
    const info = await getRepo(owner, repo);
    const file = path?.join("/");
    const title = file ? `${titleOf(file)} — ${info.name}` : info.name;
    return {
      title,
      description: info.description ?? `${info.full_name} documentation`,
    };
  } catch {
    return { title: `${owner}/${repo}` };
  }
}

export default async function RepoDocPage({ params }: { params: Promise<Params> }) {
  const { owner, repo: repoName, path } = await params;

  const loaded = await loadRepo(owner, repoName);
  if (loaded.error === "404") notFound();
  if (!loaded.repo || loaded.error) {
    return (
      <main className="container">
        <div className="notice" style={{ marginTop: 40 }}>
          <h3>GitHub says no</h3>
          <p>{loaded.error}</p>
        </div>
      </main>
    );
  }

  const repo: Repo = loaded.repo;

  let entries;
  try {
    entries = await getTree(owner, repoName, repo.default_branch);
  } catch (err) {
    return (
      <main className="container">
        <div className="notice" style={{ marginTop: 40 }}>
          <h3>Couldn&apos;t read the repository tree</h3>
          <p>{err instanceof GitHubError ? err.message : "Unexpected error."}</p>
        </div>
      </main>
    );
  }

  const files = markdownFiles(entries);
  const requested = path?.join("/") ?? "";

  // /docs/guide.md -> /docs/guide (canonical URL, no extension)
  if (requested && MARKDOWN_RE.test(requested)) {
    redirect(docHref(owner, repoName, requested));
  }

  const currentPath = requested ? resolveDocPath(requested, files) : findReadme(entries);
  if (requested && !currentPath) notFound();

  if (!currentPath) {
    return (
      <main className="container">
        <RepoHeading repo={repo} />
        <p className="empty">
          This repository has no README or markdown files yet.{" "}
          <a href={`${repo.html_url}#readme`} target="_blank" rel="noreferrer noopener">
            Open it on GitHub ↗
          </a>
        </p>
      </main>
    );
  }

  let markdown = "";
  try {
    markdown = await getFile(owner, repoName, currentPath, repo.default_branch);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) notFound();
    return (
      <main className="container">
        <div className="notice" style={{ marginTop: 40 }}>
          <h3>Couldn&apos;t load “{currentPath}”</h3>
          <p>{err instanceof GitHubError ? err.message : "Unexpected error."}</p>
        </div>
      </main>
    );
  }

  // Big repos (hundreds of markdown files) shouldn't produce a 400-link sidebar.
  const NAV_LIMIT = 60;
  const navFiles = files.slice(0, NAV_LIMIT);
  if (!navFiles.includes(currentPath)) navFiles.unshift(currentPath);

  const { body } = stripLeadingTitle(markdown);
  const toc = buildToc(body);
  const docSet = new Set(files.map((f) => f.toLowerCase()));
  const index = files.indexOf(currentPath);
  const prev = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;

  return (
    <main className="container">
      <div className="crumbs">
        <Link href={`/?owner=${owner}`}>@{owner}</Link>
        <span className="sep">/</span>
        <Link href={`/r/${owner}/${repoName}`}>{repoName}</Link>
        {currentPath !== findReadme(entries) && (
          <>
            <span className="sep">/</span>
            <span style={{ color: "var(--fg)" }}>{titleOf(currentPath)}</span>
          </>
        )}
      </div>

      <div className="docs-shell">
        <DocsSidebar owner={owner} repo={repoName} files={navFiles} current={currentPath} />

        <div>
          {currentPath === findReadme(entries) && <RepoHeading repo={repo} />}

          <div className="layout-doc">
            <article>
              <Markdown
                markdown={body}
                ctx={{
                  owner,
                  repo: repoName,
                  branch: repo.default_branch,
                  dir: dirOf(currentPath),
                  docs: docSet,
                }}
              />

              <a
                className="btn ghost"
                style={{ marginTop: 32 }}
                href={`https://github.com/${repo.full_name}/edit/${repo.default_branch}/${currentPath}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                Edit “{currentPath}” on GitHub ↗
              </a>

              <div className="doc-footer">
                {prev ? (
                  <Link className="pager" href={docHref(owner, repoName, prev)}>
                    <small>Previous</small>
                    <span>← {titleOf(prev)}</span>
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link className="pager next" href={docHref(owner, repoName, next)}>
                    <small>Next</small>
                    <span>{titleOf(next)} →</span>
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </article>

            {toc.length > 1 && (
              <aside className="toc">
                <p>On this page</p>
                <ul>
                  {toc.map((item) => (
                    <li key={item.id} className={`lvl-${item.level}`}>
                      <a href={`#${item.id}`}>{item.text}</a>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function RepoHeading({ repo }: { repo: Repo }) {
  return (
    <header className="repo-header">
      <div className="crumbs" style={{ padding: "0 0 12px" }}>
        <span className="chip">{repo.owner.login}</span>
        {repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" && (
          <span className="chip">{repo.license.spdx_id}</span>
        )}
        {repo.archived && <span className="chip">archived</span>}
      </div>
      <h1>{repo.name}</h1>
      {repo.description && <p className="repo-blurb">{repo.description}</p>}

      <div className="stat-row">
        <span>
          <strong>{repo.stargazers_count.toLocaleString()}</strong> stars
        </span>
        <span>
          <strong>{repo.forks_count.toLocaleString()}</strong> forks
        </span>
        <span>
          <strong>{repo.open_issues_count.toLocaleString()}</strong> open issues
        </span>
        {repo.language && (
          <span>
            <strong>{repo.language}</strong>
          </span>
        )}
        <span>updated {relativeTime(repo.pushed_at)}</span>
      </div>

      <div className="repo-actions">
        <a className="btn" href={repo.html_url} target="_blank" rel="noreferrer noopener">
          Open on GitHub ↗
        </a>
        <Link className="btn ghost" href={`/?owner=${repo.owner.login}`}>
          More from @{repo.owner.login}
        </Link>
        {repo.homepage && (
          <a className="btn ghost" href={repo.homepage} target="_blank" rel="noreferrer noopener">
            Live site ↗
          </a>
        )}
      </div>
    </header>
  );
}
