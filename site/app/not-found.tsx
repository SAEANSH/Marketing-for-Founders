import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container" style={{ padding: "96px 0 140px", textAlign: "center" }}>
      <p style={{ fontSize: 64, margin: 0 }}>🔍</p>
      <h1 style={{ margin: "8px 0 12px", fontSize: 32, letterSpacing: "-0.02em" }}>
        Nothing here
      </h1>
      <p style={{ color: "var(--fg-soft)", marginBottom: 24 }}>
        That repo or markdown file doesn&apos;t exist — maybe it was renamed, deleted, or it&apos;s
        private.
      </p>
      <Link className="btn" href="/">
        Back to browsing
      </Link>
    </main>
  );
}
