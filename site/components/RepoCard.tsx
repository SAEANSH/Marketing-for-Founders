import Link from "next/link";
import type { Repo } from "@/lib/github";
import { relativeTime } from "@/lib/links";

export default function RepoCard({ repo }: { repo: Repo }) {
  return (
    <Link href={`/r/${repo.owner.login}/${repo.name}`} className="repo-card">
      <div className="repo-card-head">
        <span className="repo-name">{repo.name}</span>
        {repo.language ? <span className="chip">{repo.language}</span> : null}
      </div>
      <p className="repo-desc">{repo.description ?? "No description provided."}</p>
      <div className="repo-meta">
        <span title="Stars">★ {repo.stargazers_count.toLocaleString()}</span>
        <span title="Forks">⑂ {repo.forks_count.toLocaleString()}</span>
        <span className="repo-updated">updated {relativeTime(repo.pushed_at)}</span>
      </div>
    </Link>
  );
}
