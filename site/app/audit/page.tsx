import { Suspense } from "react";
import type { Metadata } from "next";
import AuditExperience from "@/components/audit/AuditExperience";

export const metadata: Metadata = {
  title: "Free SEO audit",
  description:
    "Paste any URL and get a scored, prioritized SEO audit across seven categories — technical SEO, content, on-page, schema, performance, AI search readiness and images.",
};

export default function AuditPage() {
  return (
    <main>
      <Suspense fallback={null}>
        <AuditExperience />
      </Suspense>
    </main>
  );
}
