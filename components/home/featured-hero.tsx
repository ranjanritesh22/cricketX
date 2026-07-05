import Link from "next/link";
import { ballLabel, scoreLine } from "@/lib/format";
import type { Fixture, TeamRef } from "@/lib/providers/types";
import { TeamFlag } from "@/components/ui/team-flag";
import { contextLine } from "./match-row";

function HeroTeamLine({ fixture, team }: { fixture: Fixture; team: TeamRef }) {
  const teamInnings = fixture.innings.filter((i) => i.battingTeamId === team.id);
  const latest = teamInnings.at(-1);
  const isBatting = fixture.battingTeamId === team.id;
  return (
    <div className="flex items-baseline gap-3">
      <TeamFlag team={team} className="translate-y-0.5" />
      <span className="w-14 font-display text-lg font-bold tracking-tight">{team.shortName}</span>
      {latest ? (
        <span className="score-figures text-3xl font-bold">
          {scoreLine(latest)}
          <span className="ml-2 text-base font-semibold text-ink-soft">({latest.oversText})</span>
        </span>
      ) : (
        <span className="text-base font-medium text-ink-faint">yet to bat</span>
      )}
      {isBatting && <span className="size-2 animate-live-pulse self-center rounded-full bg-gold" aria-label="batting" />}
    </div>
  );
}

/** The hero card for the featured live match — static render + score, no running scene. */
export function FeaturedHero({ fixture }: { fixture: Fixture }) {
  const context = contextLine(fixture);
  return (
    <Link
      href={`/match/${fixture.id}/live`}
      className="relative block overflow-hidden rounded-2xl border border-edge bg-card transition-colors hover:border-gold/40"
      style={{
        backgroundImage: "radial-gradient(120% 90% at 85% -10%, rgb(245 184 46 / 0.14), transparent 60%)",
      }}
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="truncate text-xs font-semibold tracking-wide text-ink-soft uppercase">
          {fixture.seriesName}
          {fixture.title ? ` · ${fixture.title}` : ""}
        </p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold">
          <span className="size-1.5 animate-live-pulse rounded-full bg-gold" />
          LIVE
        </span>
      </div>

      <div className="space-y-2.5 px-5 py-4">
        <HeroTeamLine fixture={fixture} team={fixture.teams.home} />
        <HeroTeamLine fixture={fixture} team={fixture.teams.away} />
      </div>

      {context ? <p className="px-5 text-sm font-semibold text-gold">{context}</p> : null}

      <div className="mt-3 flex items-center justify-between border-t border-edge px-5 py-3">
        <span className="text-xs font-semibold text-ink">
          Open live view <span aria-hidden="true">→</span>
        </span>
        {fixture.lastBall ? (
          <span className="score-figures text-xs text-ink-faint">
            Last ball: {ballLabel(fixture.lastBall.over, fixture.lastBall.ball)}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">{fixture.venue.name}</span>
        )}
      </div>
    </Link>
  );
}
