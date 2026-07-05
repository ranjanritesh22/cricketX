/**
 * H2H derivation (Phase 5, CLAUDE.md §6) — rivalry history and recent form,
 * built purely from `Fixture`s so it needs no new provider methods.
 *
 * The page scans the series' date window via `getFixtures` (request-deduped,
 * provider TTL-cached, hard-capped in size so a rate-limited provider is never
 * hammered) and this module reduces the haul to head-to-head facts.
 */
import { addDays, dateKey } from "@/lib/format";
import type { Fixture, Series, TeamRef } from "@/lib/providers/types";

/** Winner by result-sentence convention ("India won by 24 runs"). */
export function winnerTeamId(fixture: Fixture): string | null {
  if (fixture.status !== "completed") return null;
  const { home, away } = fixture.teams;
  if (fixture.statusText.startsWith(home.name)) return home.id;
  if (fixture.statusText.startsWith(away.name)) return away.id;
  return null;
}

/**
 * Date keys to scan for a series, oldest → newest, hard-capped. Long series
 * keep the most recent `cap` days (form cares about the recent past).
 */
export function seriesDateKeys(series: Series | undefined, today: Date, cap = 21): string[] {
  const end = series?.endDate ? new Date(`${series.endDate}T00:00:00`) : today;
  const start = series?.startDate ? new Date(`${series.startDate}T00:00:00`) : addDays(today, -(cap - 1));
  const keys: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) keys.push(dateKey(d));
  return keys.slice(-cap);
}

export type FormResult = "W" | "L" | "N";

export interface HeadToHead {
  /** Completed meetings between the two teams, newest first. */
  meetings: Fixture[];
  wins: Record<string, number>; // teamId → wins
  noResults: number;
  /** Last-5 form per team across ALL their completed fixtures in the window, newest first. */
  form: Record<string, FormResult[]>;
  /** Completed meetings at the given venue, newest first. */
  atVenue: Fixture[];
}

export function buildHeadToHead(
  fixtures: Fixture[],
  teamA: TeamRef,
  teamB: TeamRef,
  venueName?: string,
): HeadToHead {
  const seen = new Set<string>();
  const completed = fixtures
    .filter((f) => {
      if (f.status !== "completed" || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    })
    .sort((a, b) => b.startTime.localeCompare(a.startTime));

  const isMeeting = (f: Fixture) => {
    const ids = [f.teams.home.id, f.teams.away.id];
    return ids.includes(teamA.id) && ids.includes(teamB.id);
  };
  const meetings = completed.filter(isMeeting);

  const wins: Record<string, number> = { [teamA.id]: 0, [teamB.id]: 0 };
  let noResults = 0;
  for (const m of meetings) {
    const w = winnerTeamId(m);
    if (w && w in wins) wins[w] = (wins[w] ?? 0) + 1;
    else noResults += 1;
  }

  const formOf = (teamId: string): FormResult[] =>
    completed
      .filter((f) => f.teams.home.id === teamId || f.teams.away.id === teamId)
      .slice(0, 5)
      .map((f) => {
        const w = winnerTeamId(f);
        return w === teamId ? "W" : w === null ? "N" : "L";
      });

  return {
    meetings,
    wins,
    noResults,
    form: { [teamA.id]: formOf(teamA.id), [teamB.id]: formOf(teamB.id) },
    atVenue: venueName ? meetings.filter((f) => f.venue.name === venueName) : [],
  };
}
