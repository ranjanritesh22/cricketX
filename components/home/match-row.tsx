import Link from "next/link";
import { cn } from "@/lib/cn";
import { chaseSentence, chaseState, scoreLine } from "@/lib/format";
import type { Fixture, TeamRef } from "@/lib/providers/types";
import { StatusChip } from "@/components/ui/status-chip";
import { TeamFlag } from "@/components/ui/team-flag";

function teamScoreText(fixture: Fixture, teamId: string): string | null {
  const teamInnings = fixture.innings.filter((i) => i.battingTeamId === teamId);
  if (teamInnings.length === 0) return null;
  return teamInnings
    .map((i, idx) =>
      idx === teamInnings.length - 1 ? `${scoreLine(i)} (${i.oversText})` : scoreLine(i),
    )
    .join(" & ");
}

/** "England need 98 off 52 balls • RRR 11.31" — computed, not parroted. */
export function contextLine(fixture: Fixture): string | null {
  if (fixture.status === "live" || fixture.status === "innings-break") {
    const chase = chaseState(fixture);
    const chasingTeam = [fixture.teams.home, fixture.teams.away].find(
      (t) => t.id === fixture.innings.at(-1)?.battingTeamId,
    );
    if (chase && chasingTeam) {
      const rrr = chase.requiredRate !== null ? ` • RRR ${chase.requiredRate.toFixed(2)}` : "";
      return `${chaseSentence(chasingTeam.name, chase)}${rrr}`;
    }
    return fixture.statusText || null;
  }
  if (fixture.status === "completed" || fixture.status === "abandoned" || fixture.status === "no-result") {
    return fixture.statusText || null;
  }
  const parts = [fixture.title, fixture.venue.city ?? fixture.venue.name].filter(Boolean);
  return parts.join(" • ") || null;
}

function TeamLine({ fixture, team }: { fixture: Fixture; team: TeamRef }) {
  const score = teamScoreText(fixture, team.id);
  const isBatting =
    (fixture.status === "live" || fixture.status === "innings-break") && fixture.battingTeamId === team.id;
  const finished = fixture.status === "completed";
  const won = finished && fixture.statusText.startsWith(team.name);
  const dim = finished && !won;

  return (
    <div className="flex items-center gap-2.5">
      <TeamFlag team={team} />
      <span className={cn("flex-1 truncate text-sm font-semibold", dim ? "text-ink-soft" : "text-ink")}>
        {team.name}
      </span>
      {score ? (
        <span className={cn("score-figures text-sm font-bold", dim ? "text-ink-soft" : "text-ink")}>
          {score}
          {isBatting && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-gold align-middle" aria-label="batting" />}
        </span>
      ) : null}
    </div>
  );
}

export function MatchRow({ fixture }: { fixture: Fixture }) {
  const context = contextLine(fixture);
  return (
    <Link
      href={`/match/${fixture.id}`}
      className="block px-4 py-3 transition-colors hover:bg-card-raised focus-visible:bg-card-raised"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <TeamLine fixture={fixture} team={fixture.teams.home} />
          <TeamLine fixture={fixture} team={fixture.teams.away} />
        </div>
        <div className="flex w-16 shrink-0 justify-end">
          <StatusChip fixture={fixture} />
        </div>
      </div>
      {context ? <p className="mt-1.5 truncate text-xs text-ink-soft">{context}</p> : null}
    </Link>
  );
}
