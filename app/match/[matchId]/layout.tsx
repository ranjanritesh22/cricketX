import type { Metadata } from "next";
import { getMatchOr404 } from "@/lib/data";
import { scoreLine } from "@/lib/format";
import { ScoreHeader } from "@/components/match/score-header";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ matchId: string }> }): Promise<Metadata> {
  const { matchId } = await params;
  const detail = await getMatchOr404(matchId);
  const { home, away } = detail.teams;
  const scores = detail.innings.length
    ? detail.innings.map((i) => {
        const team = [home, away].find((t) => t.id === i.battingTeamId);
        return `${team?.shortName ?? "?"} ${scoreLine(i)}`;
      }).join(" · ")
    : `${home.shortName} vs ${away.shortName}`;
  return {
    title: `${scores} — ${detail.seriesName}${detail.title ? ` ${detail.title}` : ""}`,
    description: `${home.name} vs ${away.name}, ${detail.title ?? detail.format} at ${detail.venue.name}. ${detail.statusText}`,
  };
}

/** Sticky score header + tab bar shared across tabs — no refetch on tab switch. */
export default async function MatchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const detail = await getMatchOr404(matchId);
  return (
    <>
      <ScoreHeader detail={detail} />
      <div className="py-4">{children}</div>
    </>
  );
}
