import Link from "next/link";
import { docHref, titleOf } from "@/lib/links";

type Props = {
  owner: string;
  repo: string;
  files: string[];
  current: string | null;
};

function groupOf(path: string): string {
  if (!path.includes("/")) return "In this repo";
  return path.split("/")[0].replace(/[-_]+/g, " ");
}

export default function DocsSidebar({ owner, repo, files, current }: Props) {
  const groups = new Map<string, string[]>();
  for (const file of files) {
    const key = groupOf(file);
    const list = groups.get(key) ?? [];
    list.push(file);
    groups.set(key, list);
  }

  return (
    <nav className="sidebar" aria-label="Documentation">
      {[...groups.entries()].map(([group, items]) => (
        <div className="sidebar-group" key={group}>
          <p className="sidebar-title">{group}</p>
          <ul>
            {items.map((file) => {
              const active = current === file;
              return (
                <li key={file}>
                  <Link
                    href={docHref(owner, repo, file)}
                    className={active ? "sidebar-link active" : "sidebar-link"}
                    aria-current={active ? "page" : undefined}
                    title={file}
                  >
                    {titleOf(file)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
