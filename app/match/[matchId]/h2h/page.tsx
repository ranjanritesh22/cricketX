import Link from "next/link";
import { getFixtures, getMatchOr404, getSeries } from "@/lib/data";
import { buildHeadToHead, seriesDateKeys, winnerTeamId, type FormResult } from "@/lib/depth/h2h";
import { scoreLine, venueLocalDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Fixture, TeamRef } from "@/lib/providers/types";
import { TeamFlag } from "@/components/ui/team-flag";

export const dynamic = "force-dynamic";

function FormPills({ form }: { form: FormResult[] }) {
  if (form.length === 0) return <span className="text-xs text-ink-faint">no recent matches</span>;
  return (
    <span className="flex gap-1" aria-label={`Recent form: ${form.join(", ")}`}>
      {form.map((r, i) => (
        <span
          key={i}
          className={cn(
            "flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
            r === "W" ? "bg-gold text-night" : r === "L" ? "bg-card-raised text-ink-faint" : "bg-card-raised text-ink-soft",
          )}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function MeetingRow({ fixture, highlightTeamId }: { fixture: Fixture; highlightTeamId: string | null }) {
  const { home, away } = fixture.teams;
  const line = (team: TeamRef) => {
    const inns = fixture.innings.filter((i) => i.battingTeamId === team.id);
    return inns.length ? inns.map((i) => scoreLine(i)).join(" & ") : "—";
  };
  return (
    <Link
      href={`/match/${fixture.id}`}
      className="block px-4 py-3 transition-colors hover:bg-card-raised"
    >
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <TeamFlag team={home} />
          <span className={cn("truncate font-semibold", highlightTeamId === home.id ? "text-ink" : "text-ink-soft")}>
            {home.shortName} <span className="score-figures">{line(home)}</span>
          </span>
          <span className="text-xs text-ink-faint">v</span>
          <TeamFlag team={away} />
          <span className={cn("truncate font-semibold", highlightTeamId === away.id ? "text-ink" : "text-ink-soft")}>
            {away.shortName} <span className="score-figures">{line(away)}</span>
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        {fixture.statusText} · {venueLocalDate(fixture.startTime, fixture.venue.timezone)} · {fixture.venue.name}
      </p>
    </Link>
  );
}

export default async function HeadToHeadPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const detail = await getMatchOr404(matchId);
  const { home, away } = detail.teams;

  // One capped scan of the series window — getFixtures is request-deduped and
  // provider responses are TTL-cached, so this never hammers a rate-limited API.
  const series = (await getSeries().catch(() => [])).find((s) => s.id === detail.seriesId);
  const dates = seriesDateKeys(series, new Date());
  const fixturesByDay = await Promise.all(dates.map((d) => getFixtures(d).catch(() => [])));
  const h2h = buildHeadToHead(fixturesByDay.flat(), home, away, detail.venue.name);

  const homeWins = h2h.wins[home.id] ?? 0;
  const awayWins = h2h.wins[away.id] ?? 0;

  if (h2h.meetings.length === 0) {
    return (
      <section className="animate-fade-up rounded-2xl border border-edge bg-card px-6 py-12 text-center">
        <p className="font-display text-lg font-bold text-ink">First meeting on record</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          No completed {home.shortName} v {away.shortName} matches in this series window yet — the rivalry ledger
          starts with this one.
        </p>
      </section>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      <section className="overflow-hidden rounded-2xl border border-edge bg-card">
        <h2 className="border-b border-edge px-4 py-2.5 text-xs font-bold tracking-wide text-ink-soft uppercase">
          Head to head · this series
        </h2>
        <div className="grid grid-cols-3 items-center px-4 py-5">
          <div className="flex flex-col items-center gap-1.5">
            <TeamFlag team={home} className="text-2xl" />
            <span className="score-figures font-display text-3xl font-bold text-ink">{homeWins}</span>
            <span className="text-xs font-semibold text-ink-soft">{home.shortName} wins</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="score-figures text-sm font-bold text-ink-faint">{h2h.meetings.length}</span>
            <span className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">played</span>
            {h2h.noResults > 0 && <span className="text-[10px] text-ink-faint">{h2h.noResults} no result</span>}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <TeamFlag team={away} className="text-2xl" />
            <span className="score-figures font-display text-3xl font-bold text-ink">{awayWins}</span>
            <span className="text-xs font-semibold text-ink-soft">{away.shortName} wins</span>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-edge bg-card">
        <h2 className="border-b border-edge px-4 py-2.5 text-xs font-bold tracking-wide text-ink-soft uppercase">
          Recent form <span className="normal-case">· newest first</span>
        </h2>
        <div className="divide-y divide-edge/60">
          {[home, away].map((team) => (
            <div key={team.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <TeamFlag team={team} />
                {team.name}
              </span>
              <FormPills form={h2h.form[team.id] ?? []} />
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-edge bg-card">
        <h2 className="border-b border-edge px-4 py-2.5 text-xs font-bold tracking-wide text-ink-soft uppercase">
          Meetings
        </h2>
        <div className="divide-y divide-edge/60">
          {h2h.meetings.map((m) => (
            <MeetingRow key={m.id} fixture={m} highlightTeamId={winnerTeamId(m)} />
          ))}
        </div>
      </section>

      {h2h.atVenue.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-edge bg-card">
          <h2 className="border-b border-edge px-4 py-2.5 text-xs font-bold tracking-wide text-ink-soft uppercase">
            At {detail.venue.name}
          </h2>
          <div className="divide-y divide-edge/60">
            {h2h.atVenue.map((m) => (
              <MeetingRow key={m.id} fixture={m} highlightTeamId={winnerTeamId(m)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
