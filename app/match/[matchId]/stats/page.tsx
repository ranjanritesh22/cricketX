import { getBallByBall, getMatchOr404, getScorecard, getSquads } from "@/lib/data";
import {
  batterWagon,
  bowlerDeliveries,
  eventsOfInnings,
  inningsBallCoverage,
  manhattanSeries,
  partnershipSeries,
  pitchDots,
  wagonSegments,
  wormSeries,
} from "@/lib/depth/stats";
import type { InningsScorecard, Scorecard, Squads, TeamRef } from "@/lib/providers/types";
import { ManhattanChart } from "@/components/charts/manhattan-chart";
import { PartnershipBars } from "@/components/charts/partnership-bars";
import { PitchScatter } from "@/components/charts/pitch-scatter";
import { WagonWheel, OutcomeLegend } from "@/components/charts/wagon-wheel";
import { WormChart } from "@/components/charts/worm-chart";

export const dynamic = "force-dynamic";

/** Worm series colors — the palette's strongest CVD pairing, direct-labeled. */
const SERIES_COLORS = ["#F5B82E", "#3B82F6"];

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-edge bg-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-edge px-4 py-2.5">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">{title}</h2>
        {note && <p className="text-[10px] font-semibold text-ink-faint">{note}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <section className="rounded-2xl border border-edge bg-card px-6 py-12 text-center">
      <p className="font-display text-lg font-bold text-ink">No stats yet</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{text}</p>
    </section>
  );
}

function teamOf(teams: TeamRef[], id: string): TeamRef | undefined {
  return teams.find((t) => t.id === id);
}

/** Top batters (by runs) with at least one scoring delivery in the feed. */
function wagonPlayers(scorecard: Scorecard, events: ReturnType<typeof eventsOfInnings>, squads: Squads | null) {
  const out: { playerId: string; name: string; runs: number; balls: number; segments: ReturnType<typeof wagonSegments> }[] = [];
  for (const inn of scorecard.innings) {
    for (const b of inn.batting) {
      const shots = batterWagon(events, b.playerId, squads);
      if (shots.length === 0) continue;
      out.push({ playerId: b.playerId, name: b.playerName, runs: b.runs, balls: b.balls, segments: wagonSegments(shots) });
    }
  }
  return out.sort((a, b) => b.runs - a.runs).slice(0, 4);
}

/** Top bowlers (wickets, then overs) with deliveries in the feed. */
function scatterPlayers(scorecard: Scorecard, events: ReturnType<typeof eventsOfInnings>, squads: Squads | null) {
  const out: { playerId: string; name: string; figures: string; dots: ReturnType<typeof pitchDots>; wickets: number; legalBalls: number }[] = [];
  for (const inn of scorecard.innings) {
    for (const b of inn.bowling) {
      const balls = bowlerDeliveries(events, b.playerId, squads);
      if (balls.length === 0) continue;
      out.push({
        playerId: b.playerId,
        name: b.playerName,
        figures: `${b.wickets}/${b.runs} (${b.oversText})`,
        dots: pitchDots(balls),
        wickets: b.wickets,
        legalBalls: b.legalBalls,
      });
    }
  }
  return out.sort((a, b) => b.wickets - a.wickets || b.legalBalls - a.legalBalls).slice(0, 4);
}

export default async function StatsPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const detail = await getMatchOr404(matchId);

  if (detail.status === "upcoming") {
    return (
      <div className="animate-fade-up">
        <EmptyState text="Worms, Manhattans, partnerships and wagon wheels build up here ball by ball once the match starts." />
      </div>
    );
  }

  const [scorecard, events, squads] = await Promise.all([
    getScorecard(matchId).catch(() => ({ matchId, innings: [] as InningsScorecard[] })),
    getBallByBall(matchId).catch(() => []),
    getSquads(matchId).catch(() => null),
  ]);

  if (scorecard.innings.length === 0) {
    return (
      <div className="animate-fade-up">
        <EmptyState text="No innings data is available for this match yet." />
      </div>
    );
  }

  const teams = [detail.teams.home, detail.teams.away];
  // Worm/Manhattan render only for innings whose ball feed foots against the
  // scorecard — providers sometimes hold just a recent window, and we'd rather
  // show nothing than a chart that lies (CLAUDE.md honesty posture).
  const covered = scorecard.innings.filter((inn) => inningsBallCoverage(eventsOfInnings(events, inn.number), inn));
  const wagons = wagonPlayers(scorecard, events, squads);
  const scatters = scatterPlayers(scorecard, events, squads);

  return (
    <div className="animate-fade-up space-y-4">
      {covered.length > 0 && (
        <Card title="The worm" note="cumulative runs · dots are wickets">
          <WormChart
            maxOvers={detail.oversPerInnings ?? 0}
            series={covered.map((inn, i) => ({
              label: teamOf(teams, inn.battingTeamId)?.shortName ?? `Inns ${inn.number}`,
              color: SERIES_COLORS[i % SERIES_COLORS.length]!,
              points: wormSeries(eventsOfInnings(events, inn.number)),
            }))}
          />
          <ul className="mt-1 flex gap-4">
            {covered.map((inn, i) => (
              <li key={inn.number} className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-faint">
                <span
                  className="h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
                  aria-hidden="true"
                />
                {teamOf(teams, inn.battingTeamId)?.name ?? `Innings ${inn.number}`}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {covered.map((inn) => (
        <Card
          key={`man-${inn.number}`}
          title={`${teamOf(teams, inn.battingTeamId)?.shortName ?? inn.number} — runs per over`}
          note="dots are wickets"
        >
          <ManhattanChart bars={manhattanSeries(eventsOfInnings(events, inn.number))} totalOvers={detail.oversPerInnings ?? 0} />
        </Card>
      ))}

      {covered.length === 0 && (
        <p className="rounded-2xl border border-edge bg-card px-4 py-3 text-xs leading-relaxed text-ink-soft">
          Over-by-over charts need the full ball-by-ball feed, and the provider only holds a recent window for this
          match — showing what the scorecard proves instead.
        </p>
      )}

      {scorecard.innings.map((inn) => {
        const stands = partnershipSeries(inn);
        if (stands.length === 0) return null;
        return (
          <Card
            key={`p-${inn.number}`}
            title={`${teamOf(teams, inn.battingTeamId)?.name ?? `Innings ${inn.number}`} — partnerships`}
          >
            <PartnershipBars stands={stands} />
          </Card>
        );
      })}

      {wagons.length > 0 && (
        <Card title="Wagon wheels" note="synthesized from commentary · scoring shots">
          <div className="grid grid-cols-2 gap-4">
            {wagons.map((w) => (
              <figure key={w.playerId}>
                <WagonWheel segments={w.segments} />
                <figcaption className="mt-1.5 text-center text-xs font-semibold text-ink">
                  {w.name}
                  <span className="score-figures ml-1.5 text-ink-soft">
                    {w.runs} ({w.balls})
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <OutcomeLegend withDot={false} />
          </div>
        </Card>
      )}

      {scatters.length > 0 && (
        <Card title="Bowling maps" note="synthesized line & length">
          <div className="grid grid-cols-2 gap-4">
            {scatters.map((s) => (
              <figure key={s.playerId}>
                <PitchScatter dots={s.dots} />
                <figcaption className="mt-1.5 text-center text-xs font-semibold text-ink">
                  {s.name}
                  <span className="score-figures ml-1.5 text-ink-soft">{s.figures}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <div className="mt-3 flex justify-center">
            <OutcomeLegend />
          </div>
        </Card>
      )}
    </div>
  );
}
