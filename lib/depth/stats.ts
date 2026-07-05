/**
 * Stats-tab data builders (Phase 5, CLAUDE.md §6 "Stats tab") — pure functions
 * from canonical Scorecard / BallEvent data to chart-ready series.
 *
 * Honesty rule: worm and Manhattan need the innings' FULL ball-by-ball feed.
 * Providers sometimes hold only a recent window (the mock live match ships a
 * sampled window), so `inningsBallCoverage` cross-checks the events against
 * the scorecard and the charts render only when the data actually foots.
 * Partnerships come from fall-of-wickets, so they work from the scorecard
 * alone. Wagon wheels / pitch maps are synthesized per available delivery and
 * are labeled with the delivery count they were built from.
 */
import type {
  BallEvent,
  BattingHand,
  InningsScorecard,
  Squads,
  SynthesizedShot,
} from "@/lib/providers/types";
import { synthesizeShot, type SynthesizeContext } from "@/lib/synth";
import { outcomeColor, shotAngle, shotSeed } from "@/lib/synth/scene";

// ── Coverage ─────────────────────────────────────────────────────────────────

/** Do these events fully cover the innings the scorecard describes? */
export function inningsBallCoverage(events: BallEvent[], innings: InningsScorecard): boolean {
  if (events.length === 0) return innings.legalBalls === 0;
  let runs = 0;
  let legal = 0;
  for (const e of events) {
    runs += e.runs.total;
    if (e.extraType !== "wide" && e.extraType !== "noball") legal += 1;
  }
  return runs === innings.runs && legal === innings.legalBalls;
}

export function eventsOfInnings(events: BallEvent[], inningsNumber: number): BallEvent[] {
  return events.filter((e) => e.innings === inningsNumber);
}

// ── Worm (cumulative runs per legal-ball progress) ───────────────────────────

export interface WormPoint {
  /** X in overs (legal-ball progress / 6) — wides stack runs without advancing. */
  overs: number;
  runs: number;
  wicket: boolean;
}

export function wormSeries(events: BallEvent[]): WormPoint[] {
  const points: WormPoint[] = [{ overs: 0, runs: 0, wicket: false }];
  let runs = 0;
  let legal = 0;
  for (const e of events) {
    runs += e.runs.total;
    if (e.extraType !== "wide" && e.extraType !== "noball") legal += 1;
    points.push({ overs: legal / 6, runs, wicket: Boolean(e.wicket) });
  }
  return points;
}

// ── Manhattan (runs + wickets per over) ──────────────────────────────────────

export interface OverBar {
  over: number; // 1-based display over
  runs: number;
  wickets: number;
}

export function manhattanSeries(events: BallEvent[]): OverBar[] {
  const byOver = new Map<number, OverBar>();
  for (const e of events) {
    let bar = byOver.get(e.over);
    if (!bar) {
      bar = { over: e.over + 1, runs: 0, wickets: 0 };
      byOver.set(e.over, bar);
    }
    bar.runs += e.runs.total;
    if (e.wicket) bar.wickets += 1;
  }
  return [...byOver.values()].sort((a, b) => a.over - b.over);
}

// ── Partnerships (from fall of wickets — works without ball data) ────────────

export interface Partnership {
  wicket: number; // partnership for this wicket (1st-wicket stand = 1); 0 = unbroken
  runs: number;
  names: [string, string];
  unbroken: boolean;
}

/**
 * Rebuild the stands by walking the batting order: start with batters 1–2,
 * replace whoever fell with the next batter in. FoW carries who fell; the
 * batting order fills in their partner.
 */
export function partnershipSeries(innings: InningsScorecard): Partnership[] {
  const order = [...innings.batting].sort((a, b) => a.battingOrder - b.battingOrder);
  if (order.length < 2) return [];
  const nameOf = (i: number) => order[i]?.playerName ?? "—";
  const stands: Partnership[] = [];
  let atCrease: [number, number] = [0, 1];
  let nextIn = 2;
  let lastRuns = 0;

  for (const fow of innings.fallOfWickets) {
    const fallenSlot = atCrease.findIndex((idx) => order[idx]?.playerId === fow.playerId);
    stands.push({
      wicket: fow.wicket,
      runs: fow.runs - lastRuns,
      names: [nameOf(atCrease[0]), nameOf(atCrease[1])],
      unbroken: false,
    });
    lastRuns = fow.runs;
    // Replace the fallen batter (or slot 0 if FoW named someone we can't place —
    // e.g. a retired batter's slot) with the next in the order.
    const slot = fallenSlot >= 0 ? fallenSlot : 0;
    atCrease = slot === 0 ? [nextIn, atCrease[1]] : [atCrease[0], nextIn];
    nextIn += 1;
  }

  if (innings.runs > lastRuns || innings.fallOfWickets.length === 0) {
    const bothIn = atCrease.every((idx) => idx < order.length);
    if (bothIn) {
      stands.push({
        wicket: 0,
        runs: innings.runs - lastRuns,
        names: [nameOf(atCrease[0]), nameOf(atCrease[1])],
        unbroken: true,
      });
    }
  }
  return stands;
}

// ── Synthesized shots (wagon wheels + bowler pitch maps) ─────────────────────

export interface SynthBall {
  event: BallEvent;
  shot: SynthesizedShot;
}

/** Squad lookup → per-ball SynthesizeContext (handedness mirrors the wheel). */
export function synthContextFor(squads: Squads | null, event: BallEvent): SynthesizeContext {
  if (!squads) return {};
  let battingHand: BattingHand | undefined;
  let bowlingStyle: string | undefined;
  for (const { players } of squads.teams) {
    for (const p of players) {
      if (p.id === event.batterId && p.battingHand) battingHand = p.battingHand;
      if (p.id === event.bowlerId && p.bowlingStyle) bowlingStyle = p.bowlingStyle;
    }
  }
  return {
    ...(battingHand ? { battingHand } : {}),
    ...(bowlingStyle ? { bowlingStyle } : {}),
  };
}

/** Scoring deliveries for a batter (their wagon wheel), synthesized. */
export function batterWagon(events: BallEvent[], batterId: string, squads: Squads | null): SynthBall[] {
  return events
    .filter((e) => e.batterId === batterId && e.runs.batter > 0)
    .map((event) => ({ event, shot: event.synth ?? synthesizeShot(event, synthContextFor(squads, event)) }));
}

/** Every delivery by a bowler (their line/length scatter), synthesized. */
export function bowlerDeliveries(events: BallEvent[], bowlerId: string, squads: Squads | null): SynthBall[] {
  return events
    .filter((e) => e.bowlerId === bowlerId)
    .map((event) => ({ event, shot: event.synth ?? synthesizeShot(event, synthContextFor(squads, event)) }));
}

/** Serializable wagon-wheel segment — safe to pass server → client. */
export interface WagonSegment {
  angle: number; // deg, 0 = straight, +leg/−off for a right-hander
  radius: number; // 0..1 of boundary distance
  color: string;
  runs: number;
  isSix: boolean;
  label: string;
}

export function wagonSegments(shots: SynthBall[]): WagonSegment[] {
  return shots.map(({ event, shot }) => ({
    angle: shotAngle(shot, shotSeed(event)),
    radius: Math.max(shot.landingRadius, 0.08),
    color: outcomeColor(event, shot),
    runs: event.runs.batter,
    isSix: event.runs.batter === 6,
    label: `${event.runs.batter} run${event.runs.batter === 1 ? "" : "s"} — ${shot.shotType} (${event.over}.${event.ball})`,
  }));
}

/** Serializable pitch-map dot for a bowler's line/length scatter. */
export interface PitchDot {
  line: SynthesizedShot["line"];
  length: SynthesizedShot["length"];
  color: string;
  boundary: boolean;
  wicket: boolean;
  jitter: number; // deterministic -1..1
  label: string;
}

export function pitchDots(balls: SynthBall[]): PitchDot[] {
  return balls.map(({ event, shot }) => ({
    line: shot.line,
    length: shot.length,
    color: outcomeColor(event, shot),
    boundary: shot.isBoundary,
    wicket: Boolean(event.wicket),
    jitter: ((shotSeed(event) % 17) - 8) / 8,
    label: `${event.over}.${event.ball} — ${shot.length}, ${shot.line}${event.wicket ? ", WICKET" : `, ${event.runs.total} run${event.runs.total === 1 ? "" : "s"}`}`,
  }));
}
