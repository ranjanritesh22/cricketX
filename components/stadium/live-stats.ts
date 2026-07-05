/**
 * Live player figures derived purely from the ball-by-ball stream (Phase 4
 * enhancement) — the numbers behind the in-stadium name chips and hover
 * tooltips. We deliberately compute these from `BallEvent[]` (which the panel
 * already holds) rather than fetching a scorecard: it keeps the tooltip in
 * lockstep with the reconstruction playhead and needs zero extra requests.
 *
 * Honesty: these are *this innings, up to the ball on screen* — current match
 * figures, never career stats we don't have. Names are recovered from the
 * "Bowler to Batter, …" commentary shape; when a name can't be parsed the UI
 * falls back to the role ("Striker", "Bowler").
 *
 * Pure — no three.js, no React. Unit-testable.
 */
import type { BallEvent } from "@/lib/providers/types";

export interface BatLine {
  id: string;
  name?: string;
  runs: number;
  balls: number; // legal balls faced
  fours: number;
  sixes: number;
}

export interface BowlLine {
  id: string;
  name?: string;
  balls: number; // legal balls bowled
  runs: number; // runs conceded (charged to the bowler)
  wickets: number; // bowler-credited only
  dots: number;
}

export interface LiveStats {
  bat: Map<string, BatLine>;
  bowl: Map<string, BowlLine>;
  /** Recovered id → display name map (from commentary). */
  names: Map<string, string>;
}

/** Wicket kinds credited to the bowler (run-out / retired are not). */
const BOWLER_WICKETS = new Set([
  "bowled",
  "caught",
  "caught and bowled",
  "lbw",
  "stumped",
  "hit wicket",
]);

/** "Bowler to Batter, …" → bowler display name. */
export function bowlerName(e: BallEvent): string | undefined {
  const m = /^(.{2,40}?) to .{2,40}?[,.!]/.exec(e.commentaryText);
  const n = m?.[1]?.trim();
  return n && n.length >= 2 && n.length <= 24 ? n : undefined;
}

/** "Bowler to Batter, …" → striker display name. */
export function batterName(e: BallEvent): string | undefined {
  const m = /^.{2,40}? to (.{2,40}?)[,.!]/.exec(e.commentaryText);
  const n = m?.[1]?.trim();
  return n && n.length >= 2 && n.length <= 24 ? n : undefined;
}

function bat(map: Map<string, BatLine>, id: string): BatLine {
  let line = map.get(id);
  if (!line) {
    line = { id, runs: 0, balls: 0, fours: 0, sixes: 0 };
    map.set(id, line);
  }
  return line;
}

function bowl(map: Map<string, BowlLine>, id: string): BowlLine {
  let line = map.get(id);
  if (!line) {
    line = { id, balls: 0, runs: 0, wickets: 0, dots: 0 };
    map.set(id, line);
  }
  return line;
}

/**
 * Aggregate one innings up to (and including) `uptoIdx` in `events`.
 * `events` should be the full stream; only balls of `innings` are counted.
 */
export function deriveLiveStats(events: BallEvent[], innings: number, uptoIdx: number): LiveStats {
  const stats: LiveStats = { bat: new Map(), bowl: new Map(), names: new Map() };
  const end = Math.min(uptoIdx, events.length - 1);
  for (let i = 0; i <= end; i += 1) {
    const e = events[i]!;
    if (e.innings !== innings) continue;

    const bn = bowlerName(e);
    const sn = batterName(e);
    if (bn) stats.names.set(e.bowlerId, bn);
    if (sn) stats.names.set(e.batterId, sn);

    const legal = e.extraType !== "wide" && e.extraType !== "noball";

    // ── Batting (striker) ──
    if (e.batterId) {
      const b = bat(stats.bat, e.batterId);
      b.name = stats.names.get(e.batterId);
      // A wide is not a ball faced; everything else (incl. byes) is.
      if (e.extraType !== "wide") b.balls += 1;
      b.runs += e.runs.batter;
      if (e.runs.batter === 4) b.fours += 1;
      if (e.runs.batter === 6) b.sixes += 1;
    }

    // ── Bowling ──
    if (e.bowlerId) {
      const bw = bowl(stats.bowl, e.bowlerId);
      bw.name = stats.names.get(e.bowlerId);
      if (legal) bw.balls += 1;
      // Charged to the bowler: batter runs + wides + no-balls (not byes/legbyes).
      const wideNb = e.extraType === "wide" || e.extraType === "noball" ? e.runs.extras : 0;
      bw.runs += e.runs.batter + wideNb;
      if (legal && e.runs.total === 0 && !e.wicket) bw.dots += 1;
      if (e.wicket && BOWLER_WICKETS.has(e.wicket.kind)) bw.wickets += 1;
    }
  }
  return stats;
}

export function oversText(balls: number): string {
  const o = Math.floor(balls / 6);
  const b = balls % 6;
  return b === 0 ? `${o}` : `${o}.${b}`;
}

export function strikeRate(runs: number, balls: number): number | null {
  return balls > 0 ? (runs / balls) * 100 : null;
}

export function economy(runs: number, balls: number): number | null {
  return balls > 0 ? (runs / balls) * 6 : null;
}

export type Milestone = { kind: "fifty" | "hundred"; runs: number; name?: string } | null;

/**
 * Did the striker cross a fifty/hundred exactly on the ball at `idx`?
 * Returns the highest milestone newly reached (a 47→52 ball is a fifty; a
 * 98→102 ball is a hundred), else null.
 */
export function milestoneAt(events: BallEvent[], idx: number): Milestone {
  const e = events[idx];
  if (!e || e.runs.batter <= 0) return null;
  const innings = e.innings;
  let before = 0;
  for (let i = 0; i < idx; i += 1) {
    const p = events[i]!;
    if (p.innings === innings && p.batterId === e.batterId) before += p.runs.batter;
  }
  const after = before + e.runs.batter;
  const name = batterName(e);
  if (before < 100 && after >= 100) return { kind: "hundred", runs: after, name };
  if (before < 50 && after >= 50) return { kind: "fifty", runs: after, name };
  return null;
}
