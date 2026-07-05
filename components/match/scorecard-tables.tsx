import Link from "next/link";
import { cn } from "@/lib/cn";
import type { InningsScorecard, TeamRef } from "@/lib/providers/types";

function PlayerLink({ playerId, children, className }: { playerId: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={`/player/${encodeURIComponent(playerId)}`}
      className={cn("rounded-sm transition-colors hover:text-gold", className)}
    >
      {children}
    </Link>
  );
}

const NUM_CELL = "score-figures px-2 py-2 text-right text-sm";
const HEAD_CELL = "px-2 pb-1.5 text-right text-[10px] font-bold tracking-wider text-ink-faint uppercase";

function BattingTable({ innings }: { innings: InningsScorecard }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-edge">
          <th className={cn(HEAD_CELL, "w-full pl-4 text-left")}>Batter</th>
          <th className={cn(HEAD_CELL, "text-ink-soft")}>R</th>
          <th className={HEAD_CELL}>B</th>
          <th className={cn(HEAD_CELL, "hidden min-[420px]:table-cell")}>4s</th>
          <th className={cn(HEAD_CELL, "hidden min-[420px]:table-cell")}>6s</th>
          <th className={cn(HEAD_CELL, "pr-4")}>SR</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-edge/60">
        {innings.batting.map((b) => (
          <tr key={b.playerId}>
            <td className="py-2 pl-4">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <PlayerLink playerId={b.playerId}>{b.playerName}</PlayerLink>
                {!b.isOut && <span className="size-1.5 rounded-full bg-gold" aria-label="not out" />}
              </span>
              <span className={cn("mt-0.5 block text-xs", b.isOut ? "text-ink-faint" : "text-gold/80")}>
                {b.dismissal}
              </span>
            </td>
            <td className={cn(NUM_CELL, "font-bold")}>{b.runs}</td>
            <td className={cn(NUM_CELL, "text-ink-soft")}>{b.balls}</td>
            <td className={cn(NUM_CELL, "hidden text-ink-soft min-[420px]:table-cell")}>{b.fours}</td>
            <td className={cn(NUM_CELL, "hidden text-ink-soft min-[420px]:table-cell")}>{b.sixes}</td>
            <td className={cn(NUM_CELL, "pr-4 text-ink-soft")}>{b.strikeRate?.toFixed(1) ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BowlingTable({ innings }: { innings: InningsScorecard }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-edge">
          <th className={cn(HEAD_CELL, "w-full pl-4 text-left")}>Bowler</th>
          <th className={HEAD_CELL}>O</th>
          <th className={cn(HEAD_CELL, "hidden min-[420px]:table-cell")}>M</th>
          <th className={HEAD_CELL}>R</th>
          <th className={cn(HEAD_CELL, "text-ink-soft")}>W</th>
          <th className={cn(HEAD_CELL, "pr-4")}>Econ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-edge/60">
        {innings.bowling.map((b) => (
          <tr key={b.playerId}>
            <td className="py-2 pl-4 text-sm font-semibold text-ink">
              <PlayerLink playerId={b.playerId}>{b.playerName}</PlayerLink>
            </td>
            <td className={cn(NUM_CELL, "text-ink-soft")}>{b.oversText}</td>
            <td className={cn(NUM_CELL, "hidden text-ink-soft min-[420px]:table-cell")}>{b.maidens}</td>
            <td className={cn(NUM_CELL, "text-ink-soft")}>{b.runs}</td>
            <td className={cn(NUM_CELL, "font-bold", b.wickets >= 3 ? "text-wicket" : undefined)}>{b.wickets}</td>
            <td className={cn(NUM_CELL, "pr-4 text-ink-soft")}>{b.economy?.toFixed(2) ?? "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InningsCard({
  innings,
  battingTeam,
  defaultOpen,
}: {
  innings: InningsScorecard;
  battingTeam: TeamRef | undefined;
  defaultOpen: boolean;
}) {
  const extras = innings.extras;
  const extrasDetail = [
    extras.byes ? `b ${extras.byes}` : null,
    extras.legbyes ? `lb ${extras.legbyes}` : null,
    extras.wides ? `w ${extras.wides}` : null,
    extras.noballs ? `nb ${extras.noballs}` : null,
    extras.penalty ? `p ${extras.penalty}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <details className="group overflow-hidden rounded-2xl border border-edge bg-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 transition-colors hover:bg-card-raised [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-bold text-ink">
          {battingTeam?.name ?? innings.battingTeamId}
          <span className="ml-2 text-xs font-semibold text-ink-faint">
            {innings.number <= 2 ? `${nth(innings.number)} innings` : `${nth(innings.number)} innings`}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="score-figures text-base font-bold">
            {innings.wickets >= 10 ? innings.runs : `${innings.runs}/${innings.wickets}`}
            <span className="ml-1.5 text-xs font-semibold text-ink-soft">({innings.oversText})</span>
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="text-ink-faint transition-transform group-open:rotate-180"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      <div className="border-t border-edge">
        <BattingTable innings={innings} />

        <div className="flex items-center justify-between border-t border-edge px-4 py-2 text-xs">
          <span className="font-semibold text-ink-soft">
            Extras{extrasDetail ? <span className="ml-1.5 font-normal text-ink-faint">({extrasDetail})</span> : null}
          </span>
          <span className="score-figures font-bold text-ink">{extras.total}</span>
        </div>

        <div className="flex items-center justify-between border-t border-edge bg-card-raised/50 px-4 py-2.5">
          <span className="text-xs font-bold tracking-wide text-ink-soft uppercase">Total</span>
          <span className="score-figures text-sm font-bold text-ink">
            {innings.runs}/{innings.wickets}
            <span className="ml-1.5 text-xs font-semibold text-ink-soft">
              ({innings.oversText} ov{innings.runRate !== null ? `, RR ${innings.runRate.toFixed(2)}` : ""})
            </span>
          </span>
        </div>

        {innings.yetToBat.length > 0 && (
          <p className="border-t border-edge px-4 py-2.5 text-xs leading-relaxed text-ink-soft">
            <span className="font-bold text-ink-faint uppercase">Yet to bat </span>
            {innings.yetToBat.map((p) => p.playerName).join(" · ")}
          </p>
        )}

        {innings.fallOfWickets.length > 0 && (
          <div className="border-t border-edge px-4 py-2.5">
            <p className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">Fall of wickets</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft">
              {innings.fallOfWickets.map((f, i) => (
                <span key={f.wicket}>
                  {i > 0 && <span className="text-ink-faint"> · </span>}
                  <span className="score-figures font-semibold text-ink">
                    {f.runs}-{f.wicket}
                  </span>{" "}
                  ({f.playerName}, {f.oversText})
                </span>
              ))}
            </p>
          </div>
        )}

        {innings.bowling.length > 0 && (
          <div className="border-t border-edge">
            <BowlingTable innings={innings} />
          </div>
        )}
      </div>
    </details>
  );
}

function nth(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}
