"use client";

/**
 * The live commentary feed + context bar (CLAUDE.md §6, Match → Live tab).
 * New balls slide in with Motion; over headers group the stream; the context
 * bar keeps score/CRR/RRR anchored to the last known ball.
 */
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/cn";
import { ballLabel, chaseState, runRate, scoreLine } from "@/lib/format";
import { ballOutcome } from "@/lib/live/outcome";
import type { WireSnapshot } from "@/lib/live/types";
import type { BallEvent } from "@/lib/providers/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveMatch, type ConnectionState, type LiveMatchState } from "./use-live-match";
import { usePlayhead } from "./use-playhead";

/** Same shape the panel writes to the playhead + the row's React key. */
function ballKey(e: BallEvent): string {
  return `${e.innings}-${e.over}-${e.ball}-${e.timestamp}`;
}

function ConnectionChip({ connection }: { connection: ConnectionState }) {
  if (connection === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gold">
        <span className="size-1.5 animate-live-pulse rounded-full bg-gold" /> LIVE
      </span>
    );
  }
  if (connection === "ended") {
    return <span className="text-[11px] font-bold text-ink-faint">ENDED</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
      <span className="size-1.5 rounded-full bg-ink-faint" />
      {connection === "connecting" ? "Connecting…" : "Reconnecting…"}
    </span>
  );
}

function ContextBar({ state }: { state: LiveMatchState }) {
  const { header, detail } = state;
  if (!header || !detail) return null;
  const current = header.innings.at(-1);
  const battingTeam = [detail.teams.home, detail.teams.away].find((t) => t.id === header.battingTeamId);
  const crr = current ? runRate(current.runs, current.legalBalls) : null;
  const chase = chaseState({ ...detail, innings: header.innings });

  return (
    <div className="sticky bottom-16 z-30 rounded-2xl border border-edge bg-card/95 px-4 py-2.5 backdrop-blur sm:bottom-2">
      <div className="flex items-center justify-between gap-3">
        <span className="score-figures min-w-0 truncate text-sm font-bold">
          {current && battingTeam ? (
            <>
              {battingTeam.shortName} {scoreLine(current)}
              <span className="ml-1 text-xs font-semibold text-ink-soft">({current.oversText})</span>
            </>
          ) : (
            "—"
          )}
        </span>
        <ConnectionChip connection={state.connection} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-ink-soft">
        <span className="min-w-0 truncate font-semibold text-gold">{header.statusText}</span>
        <span className="score-figures shrink-0 text-ink-faint">
          {crr !== null ? `CRR ${crr.toFixed(2)}` : ""}
          {chase?.requiredRate != null ? ` • RRR ${chase.requiredRate.toFixed(2)}` : ""}
          {header.lastBall ? ` • Last ball ${ballLabel(header.lastBall.over, header.lastBall.ball)}` : ""}
        </span>
      </div>
    </div>
  );
}

interface OverGroup {
  key: string;
  innings: number;
  over: number;
  runs: number;
  wickets: number;
  balls: BallEvent[]; // newest first
}

function groupByOver(events: BallEvent[]): OverGroup[] {
  const groups: OverGroup[] = [];
  for (const e of events) {
    const key = `${e.innings}-${e.over}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = { key, innings: e.innings, over: e.over, runs: 0, wickets: 0, balls: [] };
      groups.push(group);
    }
    group.runs += e.runs.total;
    if (e.wicket) group.wickets += 1;
    group.balls.unshift(e);
  }
  return groups.reverse();
}

function BallRow({
  event,
  animate,
  live,
  rowRef,
}: {
  event: BallEvent;
  animate: boolean;
  /** This is the ball the stadium is reconstructing right now. */
  live: boolean;
  rowRef?: (el: HTMLLIElement | null) => void;
}) {
  const outcome = ballOutcome(event);
  return (
    <m.li
      ref={rowRef}
      initial={animate ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "flex scroll-mt-24 gap-3 px-4 py-3 transition-colors duration-300",
        live && "border-l-2 border-gold bg-gold/10",
      )}
      aria-current={live ? "true" : undefined}
    >
      <span className={cn("score-figures w-9 shrink-0 pt-0.5 text-xs font-bold", live ? "text-gold" : "text-ink-faint")}>
        {ballLabel(event.over, event.ball)}
      </span>
      <span
        className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", outcome.className)}
        aria-hidden="true"
      >
        {outcome.label}
      </span>
      <p className={cn("min-w-0 flex-1 text-sm leading-relaxed", event.wicket ? "font-semibold text-ink" : "text-ink-soft")}>
        {event.commentaryText}
        {live && (
          <span className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] font-bold tracking-wide text-gold uppercase">
            <span className="size-1.5 animate-live-pulse rounded-full bg-gold" /> In stadium
          </span>
        )}
      </p>
    </m.li>
  );
}

export function LiveFeed({ streamPath, initial }: { streamPath: string; initial: WireSnapshot | null }) {
  const state = useLiveMatch(streamPath, initial);
  const reducedMotion = useReducedMotion() ?? false;
  const groups = useMemo(() => groupByOver(state.events), [state.events]);
  // Snapshot-delivered history renders statically; only delta-delivered balls animate in.
  const animateNew = !reducedMotion && state.version > state.snapshotVersion;

  // The ball the stadium is reconstructing — highlight it and keep it in view.
  const playheadKey = usePlayhead(streamPath);
  const liveRow = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!playheadKey || !liveRow.current) return;
    // `block: 'nearest'` is a no-op when the row is already visible, so looping
    // the last over doesn't yank the page around.
    liveRow.current.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [playheadKey, reducedMotion]);

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="space-y-4">
        <ContextBar state={state} />

        <section className="overflow-hidden rounded-2xl border border-edge bg-card">
          <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Ball by ball</h2>
            <span className="text-[10px] text-ink-faint">
              {state.connection === "ended" ? "Final" : "Streaming — one poll per match, fan-out to all"}
            </span>
          </header>

          {state.events.length === 0 ? (
            state.connection === "connecting" || state.connection === "reconnecting" ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-6" />
                <Skeleton className="h-6" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">Waiting for the first ball…</p>
            )
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div className="flex items-center justify-between border-y border-edge bg-card-raised/50 px-4 py-1.5 first:border-t-0">
                  <span className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">
                    Over {group.over} · Innings {group.innings}
                  </span>
                  <span className="score-figures text-[10px] font-bold text-ink-soft">
                    {group.runs} run{group.runs === 1 ? "" : "s"}
                    {group.wickets > 0 ? `, ${group.wickets} wkt` : ""}
                  </span>
                </div>
                <ol className="divide-y divide-edge/60">
                  {group.balls.map((event) => {
                    const key = ballKey(event);
                    const live = key === playheadKey;
                    return (
                      <BallRow
                        // timestamps are unique per delivery across all adapters —
                        // stable identity even though wides reuse a ball number
                        key={key}
                        event={event}
                        animate={animateNew}
                        live={live}
                        rowRef={live ? (el) => void (liveRow.current = el) : undefined}
                      />
                    );
                  })}
                </ol>
              </div>
            ))
          )}
        </section>
      </div>
    </LazyMotion>
  );
}
