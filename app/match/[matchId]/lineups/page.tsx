import { getBallByBall, getMatchOr404, getScorecard, getSquads } from "@/lib/data";
import { matchRatings } from "@/lib/depth/ratings";
import { batterWagon, wagonSegments } from "@/lib/depth/stats";
import type { Scorecard } from "@/lib/providers/types";
import { LineupsView, type LineupTeam } from "@/components/lineups/lineups-view";

export const dynamic = "force-dynamic";

export default async function LineupsPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const detail = await getMatchOr404(matchId);

  const [squads, scorecard, events] = await Promise.all([
    getSquads(matchId).catch(() => null),
    getScorecard(matchId).catch((): Scorecard => ({ matchId, innings: [] })),
    getBallByBall(matchId).catch(() => []),
  ]);

  const announced = squads?.teams.some((t) => t.players.length > 0) ?? false;
  if (!squads || !announced) {
    return (
      <section className="animate-fade-up rounded-2xl border border-edge bg-card px-6 py-12 text-center">
        <p className="font-display text-lg font-bold text-ink">XIs not announced yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Lineups land here at the toss — with live match ratings and per-player wagon wheels once play begins.
        </p>
      </section>
    );
  }

  const ratings = matchRatings(scorecard, detail.format);
  const batting = new Map(scorecard.innings.flatMap((inn) => inn.batting.map((b) => [b.playerId, b] as const)));
  const bowling = new Map(scorecard.innings.flatMap((inn) => inn.bowling.map((b) => [b.playerId, b] as const)));

  const teams: LineupTeam[] = squads.teams.map(({ team, players }) => ({
    team,
    players: players
      .filter((p) => p.isPlaying !== false)
      .slice(0, 11)
      .map((p) => {
        const bat = batting.get(p.id);
        const bowl = bowling.get(p.id);
        const rating = ratings.get(p.id)?.rating;
        return {
          id: p.id,
          name: p.name,
          ...(p.role ? { role: p.role } : {}),
          ...(p.isCaptain ? { isCaptain: true } : {}),
          ...(p.isKeeper ? { isKeeper: true } : {}),
          ...(p.battingHand ? { battingHand: p.battingHand } : {}),
          ...(p.bowlingStyle ? { bowlingStyle: p.bowlingStyle } : {}),
          ...(rating !== undefined ? { rating } : {}),
          ...(bat
            ? {
                battingLine: `${bat.runs}${bat.isOut ? "" : "*"} (${bat.balls})${bat.fours || bat.sixes ? ` · ${bat.fours}×4 ${bat.sixes}×6` : ""}`,
                dismissal: bat.dismissal,
              }
            : {}),
          ...(bowl ? { bowlingLine: `${bowl.wickets}/${bowl.runs} (${bowl.oversText})` } : {}),
          wagon: wagonSegments(batterWagon(events, p.id, squads)),
        };
      }),
  }));

  return (
    <div className="animate-fade-up">
      <LineupsView teams={teams} />
    </div>
  );
}
