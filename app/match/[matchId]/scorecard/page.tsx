import { getMatchOr404, getScorecard } from "@/lib/data";
import { venueLocalDate, venueLocalTime } from "@/lib/format";
import { InningsCard } from "@/components/match/scorecard-tables";

export const dynamic = "force-dynamic";

export default async function ScorecardPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const [detail, scorecard] = await Promise.all([getMatchOr404(matchId), getScorecard(matchId)]);

  if (scorecard.innings.length === 0) {
    return (
      <div className="animate-fade-up rounded-2xl border border-edge bg-card px-6 py-12 text-center">
        <p className="font-display text-lg font-bold text-ink">Scorecard appears at the first ball</p>
        <p className="mt-2 text-sm text-ink-soft">
          {detail.status === "upcoming"
            ? `Starts ${venueLocalDate(detail.startTime, detail.venue.timezone)}, ${venueLocalTime(detail.startTime, detail.venue.timezone)}.`
            : "No innings data is available for this match."}
        </p>
      </div>
    );
  }

  const teamById = new Map([detail.teams.home, detail.teams.away].map((t) => [t.id, t]));
  const latestFirst = [...scorecard.innings].reverse();

  return (
    <div className="animate-fade-up space-y-4">
      {latestFirst.map((innings, idx) => (
        <InningsCard
          key={innings.number}
          innings={innings}
          battingTeam={teamById.get(innings.battingTeamId)}
          defaultOpen={idx === 0}
        />
      ))}
    </div>
  );
}
