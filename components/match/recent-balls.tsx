import { cn } from "@/lib/cn";
import { ballLabel } from "@/lib/format";
import { ballOutcome } from "@/lib/live/outcome";
import type { BallEvent } from "@/lib/providers/types";

/** Latest-first delivery feed. Virtualization + Motion slide-ins arrive with the Phase 2 stream. */
export function RecentBalls({ events }: { events: BallEvent[] }) {
  const latestFirst = [...events].reverse();
  return (
    <ol className="divide-y divide-edge/60">
      {latestFirst.map((e, idx) => {
        const o = ballOutcome(e);
        return (
          <li key={`${e.innings}-${e.over}-${e.ball}-${idx}`} className="flex gap-3 px-4 py-3">
            <span className="score-figures w-9 shrink-0 pt-0.5 text-xs font-bold text-ink-faint">
              {ballLabel(e.over, e.ball)}
            </span>
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                o.className,
              )}
              aria-hidden="true"
            >
              {o.label}
            </span>
            <p className={cn("min-w-0 flex-1 text-sm leading-relaxed", e.wicket ? "font-semibold text-ink" : "text-ink-soft")}>
              {e.commentaryText}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
