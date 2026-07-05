import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPlayer } from "@/lib/data";
import { isPlayerNotFoundError } from "@/lib/providers/errors";
import { FORMAT_LABEL } from "@/lib/format";
import type { MatchFormat, PlayerProfile } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

/** Unknown ids → the designed 404; provider hiccups bubble to the error state. */
async function getPlayerOr404(playerId: string): Promise<PlayerProfile> {
  try {
    return await getPlayer(playerId);
  } catch (err) {
    if (isPlayerNotFoundError(err)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }): Promise<Metadata> {
  const { playerId } = await params;
  const player = await getPlayerOr404(playerId);
  return {
    title: player.name,
    description: `${player.name} — profile, career stats and recent form on StadiumX.`,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

const NUM = "score-figures px-2 py-2 text-right text-sm";
const HEAD = "px-2 pb-1.5 text-right text-[10px] font-bold tracking-wider text-ink-faint uppercase";

function fmt(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return `${v}`;
}

function CareerCard({ player }: { player: PlayerProfile }) {
  const battingFormats = Object.keys(player.batting ?? {}) as MatchFormat[];
  const bowlingFormats = Object.keys(player.bowling ?? {}) as MatchFormat[];
  if (battingFormats.length === 0 && bowlingFormats.length === 0) {
    return (
      <section className="rounded-2xl border border-edge bg-card px-6 py-10 text-center">
        <p className="text-sm leading-relaxed text-ink-soft">
          Career numbers aren&apos;t available from the current data provider — profile depth grows with the licensed
          production API.
        </p>
      </section>
    );
  }
  return (
    <>
      {battingFormats.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-edge bg-card">
          <h2 className="border-b border-edge px-4 py-2.5 text-xs font-bold tracking-wide text-ink-soft uppercase">
            Career batting
          </h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-edge">
                <th className={`${HEAD} w-full pl-4 text-left`}>Format</th>
                <th className={HEAD}>M</th>
                <th className={`${HEAD} text-ink-soft`}>Runs</th>
                <th className={HEAD}>Avg</th>
                <th className={HEAD}>SR</th>
                <th className={`${HEAD} hidden min-[420px]:table-cell`}>100s</th>
                <th className={`${HEAD} pr-4`}>HS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {battingFormats.map((f) => {
                const s = player.batting?.[f];
                if (!s) return null;
                return (
                  <tr key={f}>
                    <td className="py-2 pl-4 text-sm font-semibold text-ink">{FORMAT_LABEL[f]}</td>
                    <td className={`${NUM} text-ink-soft`}>{fmt(s.matches)}</td>
                    <td className={`${NUM} font-bold`}>{fmt(s.runs)}</td>
                    <td className={`${NUM} text-ink-soft`}>{fmt(s.average)}</td>
                    <td className={`${NUM} text-ink-soft`}>{fmt(s.strikeRate)}</td>
                    <td className={`${NUM} hidden text-ink-soft min-[420px]:table-cell`}>{fmt(s.hundreds)}</td>
                    <td className={`${NUM} pr-4 text-ink-soft`}>{fmt(s.highScore)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {bowlingFormats.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-edge bg-card">
          <h2 className="border-b border-edge px-4 py-2.5 text-xs font-bold tracking-wide text-ink-soft uppercase">
            Career bowling
          </h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-edge">
                <th className={`${HEAD} w-full pl-4 text-left`}>Format</th>
                <th className={HEAD}>M</th>
                <th className={`${HEAD} text-ink-soft`}>Wkts</th>
                <th className={HEAD}>Avg</th>
                <th className={HEAD}>Econ</th>
                <th className={`${HEAD} pr-4`}>Best</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge/60">
              {bowlingFormats.map((f) => {
                const s = player.bowling?.[f];
                if (!s) return null;
                return (
                  <tr key={f}>
                    <td className="py-2 pl-4 text-sm font-semibold text-ink">{FORMAT_LABEL[f]}</td>
                    <td className={`${NUM} text-ink-soft`}>{fmt(s.matches)}</td>
                    <td className={`${NUM} font-bold`}>{fmt(s.wickets)}</td>
                    <td className={`${NUM} text-ink-soft`}>{fmt(s.average)}</td>
                    <td className={`${NUM} text-ink-soft`}>{fmt(s.economy)}</td>
                    <td className={`${NUM} pr-4 text-ink-soft`}>{fmt(s.bestFigures)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

export default async function PlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const player = await getPlayerOr404(playerId);

  const facts: [string, string | undefined][] = [
    ["Role", player.role],
    ["Bats", player.battingHand ? `${player.battingHand}-handed` : undefined],
    ["Bowls", player.bowlingStyle],
    ["Born", player.born],
    ["Country", player.country],
  ];

  return (
    <div className="animate-fade-up space-y-4 py-4">
      <section className="flex items-center gap-4 rounded-2xl border border-edge bg-card px-5 py-5">
        {/* Stylized initials avatar — never hotlinked photos (CLAUDE.md §12). */}
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-gold/60 bg-night font-display text-xl font-bold text-gold">
          {initials(player.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold text-ink">{player.name}</h1>
          <p className="mt-1 text-xs text-ink-soft">
            {facts
              .filter(([, v]) => Boolean(v))
              .map(([, v]) => v)
              .slice(0, 3)
              .join(" · ") || "Profile"}
          </p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-edge bg-card">
        <dl className="divide-y divide-edge/60">
          {facts
            .filter((r): r is [string, string] => Boolean(r[1]))
            .map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="shrink-0 text-xs font-semibold text-ink-faint">{label}</dt>
                <dd className="text-right text-sm font-medium text-ink capitalize">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <CareerCard player={player} />
    </div>
  );
}
