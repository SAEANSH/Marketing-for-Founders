import type { Metadata } from "next";
import Link from "next/link";
import "highlight.js/styles/github-dark.css";
import "./globals.css";

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME?.trim() || "RepoDocs";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} — GitHub repos as a live documentation site`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    "Every README and doc file from your GitHub repositories, published as a fast, always-in-sync website. Push to GitHub, the site updates itself.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>
                ◆
              </span>
              <span>
                <b>{SITE_NAME}</b>
              </span>
            </Link>
            <div className="header-spacer" />
            <Link className="header-link" href="/audit">
              Free SEO audit
            </Link>
            <Link className="header-link" href="/">
              Browse repos
            </Link>
            <a
              className="header-link"
              href="https://github.com"
              target="_blank"
              rel="noreferrer noopener"
            >
              GitHub ↗
            </a>
          </div>
        </header>

        {children}

        <footer className="site-footer">
          <div className="container">
            <span>
              Built with Next.js · content pulled live from the GitHub API
            </span>
            <span>© {new Date().getFullYear()} {SITE_NAME}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
