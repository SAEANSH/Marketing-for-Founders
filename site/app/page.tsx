import Link from "next/link";
import RepoCard from "@/components/RepoCard";
import { getRepos, GitHubError, hasToken, type Repo } from "@/lib/github";

const DEFAULT_OWNER = process.env.GITHUB_OWNER?.trim() || "vercel";

export const metadata = {
  title: "Browse repositories",
};

type SearchParams = Promise<{ owner?: string }>;

async function loadRepos(owner: string): Promise<{ repos: Repo[]; error: string | null }> {
  try {
    return { repos: await getRepos(owner), error: null };
  } catch (err) {
    if (err instanceof GitHubError) return { repos: [], error: err.message };
    return { repos: [], error: "Could not reach GitHub right now. Try again in a moment." };
  }
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const owner = (sp.owner || DEFAULT_OWNER).trim().replace(/^@/, "");
  const { repos, error } = await loadRepos(owner);

  const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);

  return (
    <main>
      <section className="hero">
        <div className="container">
          <h1>
            Your GitHub repos,
            <br />
            published as <em>real docs</em>.
          </h1>
          <p className="lead">
            Point this site at any GitHub user or organisation. Every repository shows up as a
            project, and every <code>README.md</code> or <code>docs/</code> file becomes a page you
            can read, link and search — no copy-paste, no rebuilds. Push to GitHub and the page
            refreshes itself.
          </p>

          <div className="hero-cta">
            <Link className="btn btn-lg" href="/audit">
              Run a free SEO audit →
            </Link>
            <a
              className="btn ghost btn-lg"
              href="https://github.com/AgriciDaniel/claude-seo"
              target="_blank"
              rel="noreferrer noopener"
            >
              ★ Engine: claude-seo
            </a>
          </div>

          <form className="owner-form" action="/" method="get">
            <input
              type="text"
              name="owner"
              placeholder="GitHub username or org — e.g. vercel"
              defaultValue={owner}
              aria-label="GitHub username or organisation"
              spellCheck={false}
              autoComplete="off"
            />
            <button className="btn" type="submit">
              Load repos
            </button>
          </form>
        </div>
      </section>

      <section className="container">
        <div className="engine-strip">
          <div className="engine-copy">
            <span className="chip">Audit engine</span>
            <strong> AgriciDaniel/claude-seo</strong>
            <p>
              45 checks across 7 weighted categories — technical SEO, content/E-E-A-T, on-page,
              schema, performance, AI search readiness and images. Its own docs are published on
              this site, straight from GitHub.
            </p>
          </div>
          <div className="engine-actions">
            <Link className="btn" href="/audit">
              Audit a site
            </Link>
            <Link className="btn ghost" href="/r/AgriciDaniel/claude-seo">
              Read its docs →
            </Link>
          </div>
        </div>

        {error ? (
          <div className="notice">
            <h3>Couldn&apos;t load repos for “{owner}”</h3>
            <p>
              {error}
              {!hasToken() && (
                <>
                  {" "}
                  Add a <code>GITHUB_TOKEN</code> environment variable (a public-repo read token is
                  enough) to raise the limit to 5,000 requests/hour.
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="section-head">
              <h2>
                {repos.length} repositories from <span className="chip">@{owner}</span>
              </h2>
              <p>
                {stars.toLocaleString()} stars combined · content cached for a few minutes
              </p>
            </div>

            {repos.length === 0 ? (
              <p className="empty">No public repositories found for “{owner}”.</p>
            ) : (
              <div className="repo-grid">
                {repos.map((repo) => (
                  <RepoCard key={repo.full_name} repo={repo} />
                ))}
              </div>
            )}
          </>
        )}

        <p style={{ paddingBottom: 56, fontSize: 13, color: "var(--fg-faint)" }}>
          Looking for your own account?{" "}
          <Link href={`/?owner=${encodeURIComponent("SAEANSH")}`}>Try @SAEANSH</Link> — or type any
          username above.
        </p>
      </section>
    </main>
  );
}
