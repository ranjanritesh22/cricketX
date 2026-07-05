import { getMatchOr404 } from "@/lib/data";
import { FORMAT_LABEL, venueLocalDate, venueLocalTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="shrink-0 text-xs font-semibold text-ink-faint">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function InfoCard({ title, rows }: { title: string; rows: [string, string | undefined | null][] }) {
  const visible = rows.filter((r): r is [string, string] => Boolean(r[1]));
  if (visible.length === 0) return null;
  return (
    <section className="overflow-hidden rounded-2xl border border-edge bg-card">
      <h2 className="border-b border-edge px-4 py-2.5 text-xs font-bold tracking-wide text-ink-soft uppercase">
        {title}
      </h2>
      <dl className="divide-y divide-edge/60">
        {visible.map(([label, value]) => (
          <InfoRow key={label} label={label} value={value} />
        ))}
      </dl>
    </section>
  );
}

export default async function InfoPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const detail = await getMatchOr404(matchId);
  const teamById = new Map([detail.teams.home, detail.teams.away].map((t) => [t.id, t]));

  const tossText = detail.toss
    ? `${teamById.get(detail.toss.winnerTeamId)?.name ?? "?"} won the toss and chose to ${detail.toss.decision}`
    : undefined;

  return (
    <div className="animate-fade-up space-y-4">
      <InfoCard
        title="Match"
        rows={[
          ["Series", detail.seriesName],
          ["Match", detail.title ?? null],
          ["Format", FORMAT_LABEL[detail.format]],
          ["Date", venueLocalDate(detail.startTime, detail.venue.timezone)],
          ["Start", venueLocalTime(detail.startTime, detail.venue.timezone)],
          ["Series status", detail.seriesStatusText ?? null],
        ]}
      />
      <InfoCard
        title="Venue"
        rows={[
          ["Ground", detail.venue.name],
          ["City", detail.venue.city ?? null],
          ["Country", detail.venue.country ?? null],
        ]}
      />
      <InfoCard
        title="Toss & result"
        rows={[
          ["Toss", tossText],
          ["Result", detail.resultText ?? (detail.status === "upcoming" ? null : detail.statusText)],
          ["Player of the match", detail.playerOfMatchName ?? null],
        ]}
      />
      <InfoCard
        title="Officials"
        rows={[
          ["Umpires", detail.officials?.umpires?.join(", ") ?? null],
          ["TV umpire", detail.officials?.tvUmpire ?? null],
          ["Referee", detail.officials?.referee ?? null],
        ]}
      />
    </div>
  );
}
