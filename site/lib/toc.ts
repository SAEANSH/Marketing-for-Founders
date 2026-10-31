import GithubSlugger from "github-slugger";

export type TocItem = { id: string; text: string; level: number };

/** Extract h2/h3 headings (outside code fences) that rehype-slug will create ids for. */
export function buildToc(markdown: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    // slug every heading so ids stay in sync with rehype-slug
    const id = slugger.slug(text);
    if (level >= 2) items.push({ id, text, level });
  }

  return items;
}
