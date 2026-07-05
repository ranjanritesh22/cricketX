/**
 * Partnership bars — every stand of the innings, widths proportional to the
 * biggest stand. Works from the scorecard alone (no ball data needed).
 * The unbroken stand glows gold with a pulsing not-out dot.
 */
import type { Partnership } from "@/lib/depth/stats";

function nth(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n}st`;
  if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`;
  if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`;
  return `${n}th`;
}

export function PartnershipBars({ stands }: { stands: Partnership[] }) {
  if (stands.length === 0) return null;
  const max = Math.max(...stands.map((s) => s.runs), 1);
  return (
    <ol className="space-y-2.5">
      {stands.map((s, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-ink">
              {s.names[0]} <span className="text-ink-faint">&amp;</span> {s.names[1]}
            </span>
            <span className="score-figures shrink-0 font-bold text-ink">
              {s.runs}
              <span className="ml-1.5 font-semibold text-ink-faint">
                {s.unbroken ? "unbroken" : `${nth(s.wicket)} wkt`}
              </span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-card-raised">
            <div
              className={s.unbroken ? "h-full rounded-full bg-gold" : "h-full rounded-full bg-ink-faint/60"}
              style={{ width: `${Math.max((s.runs / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
