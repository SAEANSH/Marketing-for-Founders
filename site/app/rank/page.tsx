import type { Metadata } from "next";
import RankExperience from "@/components/rank/RankExperience";

export const metadata: Metadata = {
  title: "Ranking check",
  description:
    "Check where your website ranks for a keyword, how well the page is optimised for it, and which page is outranking you.",
};

export default function RankPage() {
  return (
    <main>
      <RankExperience />
    </main>
  );
}
