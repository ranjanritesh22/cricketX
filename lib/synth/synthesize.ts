/**
 * The Shot Synthesizer — Stage 1 deterministic rules parser (CLAUDE.md §4).
 *
 * A pure function: `commentaryText` + structured ball data → `SynthesizedShot`.
 * Zero cost, runs everywhere — a smarter stage may attach the result to wire
 * events server-side (the Stage-2 LLM fallback will, in Phase 5), and the
 * client derives it on the fly when absent (`shotFor(event)`), keeping the
 * SSE payload budget untouched.
 *
 * Ambiguity policy: when unsure, animate conservatively — a generic stroke to
 * the parsed zone at a modest radius, never a spectacular scene for a dot
 * ball. Confidence below 0.5 tells the renderer to use generic animation.
 */
import type { BallEvent, BattingHand, FieldingPosition, SynthesizedShot, WicketKind } from "@/lib/providers/types";
import {
  FIELD_SPOTS,
  ZONE_CENTER_ANGLE,
  findDirectionalAngle,
  findFieldingPosition,
  mirrorAngle,
  zoneOfAngle,
  type WagonZone,
} from "./field";
import {
  ADVANCE_WORDS,
  LENGTH_GROUPS,
  LINE_GROUPS,
  PACE_WORDS,
  SHOT_GROUPS,
  SPIN_WORDS,
  TRAJECTORY_GROUPS,
  type DeliveryLength,
  type DeliveryLine,
  type ShotType,
  type Trajectory,
} from "./lexicon";

/** Optional per-ball context from squad data — improves, never required. */
export interface SynthesizeContext {
  battingHand?: BattingHand;
  /** e.g. "Leg-break googly", "Right-arm fast" — squad `bowlingStyle`. */
  bowlingStyle?: string;
}

/**
 * Evidence weights. A rich Cricbuzz-style line (verb + position + delivery
 * vocab) lands ≈ 0.85–0.98; a bare generated line ("no run") stays at the
 * base, well under the 0.5 generic-animation threshold. Tuned against the
 * corpus test's ≥80% @ ≥0.7 gate — change only with the suite watching.
 */
const WEIGHT = {
  base: 0.32,
  shotVerb: 0.26,
  fieldingPosition: 0.24,
  /** A direction-carrying stroke name (cover drive, hook) — weaker than a named fielder. */
  direction: 0.12,
  deliveryType: 0.09,
  length: 0.08,
  line: 0.08,
  trajectory: 0.08,
  /** Structured wicket kinds fully determine the scene (bowled, stumped…). */
  wicketScene: 0.3,
  advance: 0.05,
  cap: 0.98,
} as const;

/** Lowercase, strip punctuation to single spaces, pad for whole-word matching. */
export function normalizeText(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .trim()} `;
}

function has(text: string, phrase: string): boolean {
  return text.includes(` ${phrase} `);
}

function anyOf(text: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => has(text, p));
}

/**
 * Longest matching phrase across all groups wins ("short of a length" beats
 * "length ball", "slog sweep" beats "slog"); ties go to the earlier group,
 * which is why each table is ordered by result-priority.
 */
function matchGroups<G extends { phrases: readonly string[] }, V>(
  text: string,
  groups: readonly G[],
  pick: (group: G) => V,
): V | undefined {
  let best: { len: number; value: V } | undefined;
  for (const group of groups) {
    for (const phrase of group.phrases) {
      if (phrase.length > (best?.len ?? 0) && has(text, phrase)) {
        best = { len: phrase.length, value: pick(group) };
      }
    }
  }
  return best?.value;
}

function phrasesOf(shot: ShotType): readonly string[] {
  return SHOT_GROUPS.find((g) => g.shot === shot)?.phrases ?? [];
}

/** "past the edge" family — a beaten bat, not ball-off-the-bat. */
const BEATEN_PHRASES: readonly string[] = [
  "past the outside edge",
  "past the inside edge",
  "past the edge",
  "beats the outside",
  "beaten past the outside",
  "beaten",
];

/** Runs the batters physically run on this delivery (drives the run animation). */
function physicalRuns(e: BallEvent): number {
  if (e.extraType === "bye" || e.extraType === "legbye") return e.runs.extras;
  if (e.extraType === "wide") return Math.max(e.runs.extras - 1, 0); // the wide itself isn't run
  if (e.extraType === "penalty") return 0;
  return e.runs.batter;
}

/** Conservative default zone per shot (RH batter) when nothing pins direction. */
const SHOT_DEFAULT_ZONE: Record<ShotType, WagonZone> = {
  defend: 5,
  drive: 5,
  cut: 7,
  pull: 3,
  sweep: 2,
  flick: 3,
  loft: 4,
  slog: 4, // cow-corner side
  edge: 8,
  leave: 8, // through to the keeper's off side
  missed: 8,
  "run-out-scramble": 4,
};

/** Radius by runs when no fielder pins the interception point. */
function radiusForRuns(runs: number, shot: ShotType): number {
  if (runs >= 4) return 1;
  if (runs === 3) return 0.85;
  if (runs === 2) return 0.65;
  if (runs === 1) return 0.45;
  // Dot balls barely leave the square.
  if (shot === "leave" || shot === "missed") return 0.05;
  if (shot === "defend") return 0.08;
  return 0.15;
}

function styleIsSpin(bowlingStyle: string): boolean {
  return /(spin|break|googly|orthodox|chinaman|wrist)/i.test(bowlingStyle);
}

function styleIsPace(bowlingStyle: string): boolean {
  return /(fast|medium|pace|seam|swing)/i.test(bowlingStyle);
}

const BEHIND_CATCHERS: ReadonlySet<FieldingPosition> = new Set([
  "wicketkeeper",
  "slip",
  "gully",
  "leg-slip",
  "leg-gully",
]);

/**
 * Synthesize the shot for one ball. Pure and deterministic — same event in,
 * same scene out, every time, on server and client alike.
 */
export function synthesizeShot(event: BallEvent, ctx: SynthesizeContext = {}): SynthesizedShot {
  const text = normalizeText(event.commentaryText);
  let confidence: number = WEIGHT.base;
  const add = (w: number) => {
    confidence = Math.min(confidence + w, WEIGHT.cap);
  };
  const hand: BattingHand = ctx.battingHand ?? "right";
  const runs = event.runs.batter;
  const isBoundary = runs === 4 || runs === 6;
  const wicketKind: WicketKind | undefined = event.wicket?.kind;

  // ── Delivery type ──────────────────────────────────────────────────────────
  let deliveryType: SynthesizedShot["deliveryType"] | undefined;
  if (anyOf(text, SPIN_WORDS)) deliveryType = "spin";
  else if (anyOf(text, PACE_WORDS)) deliveryType = "pace";
  if (deliveryType) add(WEIGHT.deliveryType);
  if (!deliveryType && ctx.bowlingStyle) {
    if (styleIsSpin(ctx.bowlingStyle)) deliveryType = "spin";
    else if (styleIsPace(ctx.bowlingStyle)) deliveryType = "pace";
    if (deliveryType) add(WEIGHT.deliveryType);
  }
  // Stumpings without any bowling clue are overwhelmingly off spinners.
  if (!deliveryType && wicketKind === "stumped") deliveryType = "spin";
  deliveryType ??= "pace";

  // ── Length & line ──────────────────────────────────────────────────────────
  let length = matchGroups<(typeof LENGTH_GROUPS)[number], DeliveryLength>(text, LENGTH_GROUPS, (g) => g.length);
  if (length) add(WEIGHT.length);

  let line = matchGroups<(typeof LINE_GROUPS)[number], DeliveryLine>(text, LINE_GROUPS, (g) => g.line);
  if (line) add(WEIGHT.line);

  // ── Shot verb ──────────────────────────────────────────────────────────────
  let shotType = matchGroups<(typeof SHOT_GROUPS)[number], ShotType>(text, SHOT_GROUPS, (g) => g.shot);
  if (shotType) add(WEIGHT.shotVerb);

  // ── Field placement evidence ───────────────────────────────────────────────
  const fielderRole: FieldingPosition | undefined = findFieldingPosition(text);
  if (fielderRole) add(WEIGHT.fieldingPosition);
  const directionalAngle = fielderRole === undefined ? findDirectionalAngle(text) : undefined;
  if (directionalAngle !== undefined) add(WEIGHT.direction);

  // ── Trajectory words — group priority: skier → flat → lofted → ground ─────
  let trajectory: Trajectory | undefined = TRAJECTORY_GROUPS.find((g) => anyOf(text, g.phrases))?.trajectory;
  if (trajectory) add(WEIGHT.trajectory);

  // ── Wicket scenes — structured data shapes the animation (CLAUDE.md §4) ───
  if (wicketKind) {
    switch (wicketKind) {
      case "bowled":
        // "chopped on" → played on off the edge; a beaten bat → clean bowled.
        shotType = anyOf(text, phrasesOf("edge")) && !anyOf(text, BEATEN_PHRASES) ? "edge" : "missed";
        trajectory = "ground";
        add(WEIGHT.wicketScene);
        break;
      case "lbw":
        // The attempted stroke is the scene: swept/pulled across the line, or a plain miss.
        shotType = anyOf(text, phrasesOf("sweep")) ? "sweep" : anyOf(text, phrasesOf("pull")) ? "pull" : "missed";
        trajectory = "ground";
        add(WEIGHT.wicketScene);
        break;
      case "stumped":
        shotType = "missed";
        add(WEIGHT.wicketScene);
        if (anyOf(text, ADVANCE_WORDS)) add(WEIGHT.advance);
        break;
      case "run out":
        shotType = "run-out-scramble";
        trajectory ??= "ground";
        add(WEIGHT.wicketScene);
        break;
      case "caught":
      case "caught and bowled": {
        // Any edge vocabulary wins — the mis-hit is what carried to the catcher.
        const spot = fielderRole ? FIELD_SPOTS[fielderRole] : undefined;
        const behind = fielderRole !== undefined && BEHIND_CATCHERS.has(fielderRole);
        if (anyOf(text, phrasesOf("edge"))) shotType = "edge";
        else if (!shotType) shotType = behind ? "edge" : spot && spot.radius > 0.6 ? "loft" : "drive";
        if (!trajectory) trajectory = shotType === "edge" ? "flat" : spot && spot.radius > 0.6 ? "lofted" : "flat";
        add(WEIGHT.wicketScene * 0.6);
        break;
      }
      case "hit wicket":
        shotType ??= "pull";
        add(WEIGHT.wicketScene * 0.6);
        break;
      default:
        // Rare kinds (retired, obstructing…) — no on-field ball scene to sell.
        add(WEIGHT.wicketScene * 0.3);
        break;
    }
  }

  // ── Extras without a stroke ────────────────────────────────────────────────
  if (!wicketKind && !shotType) {
    if (event.extraType === "wide") shotType = "missed";
    else if (event.extraType === "bye") shotType = "leave";
    else if (event.extraType === "legbye") shotType = "missed"; // off the body, not the bat
  }
  if (event.extraType === "wide" && !line) line = "wide-off";

  // ── Conservative fallbacks by outcome (never flashy for a dot) ────────────
  if (!shotType) {
    if (runs === 6) shotType = "loft";
    else if (runs > 0) shotType = "drive";
    else shotType = "defend";
  }

  // Length/line inferred from the stroke at zero confidence weight — pulls and
  // cuts come off short balls, sweeps off full ones, flicks off the pads.
  if (!length) {
    if (shotType === "pull" || shotType === "cut") length = "short";
    else if (shotType === "sweep") length = "full";
    else length = "good";
  }
  if (!line) {
    if (shotType === "cut" || shotType === "edge" || shotType === "leave") line = "off";
    else if (shotType === "sweep" || shotType === "flick") line = "leg";
    else line = "middle";
  }

  // ── Zone & radius ──────────────────────────────────────────────────────────
  const spot = fielderRole ? FIELD_SPOTS[fielderRole] : undefined;
  let angle: number;
  let landingRadius: number;
  if (spot) {
    angle = mirrorAngle(spot.angle, hand);
    // A boundary "past sweeper cover" still reaches the rope; otherwise the
    // named fielder marks where the ball was met.
    landingRadius = isBoundary ? 1 : spot.radius;
  } else if (directionalAngle !== undefined) {
    angle = mirrorAngle(directionalAngle, hand);
    landingRadius = radiusForRuns(runs, shotType);
  } else {
    angle = mirrorAngle(ZONE_CENTER_ANGLE[SHOT_DEFAULT_ZONE[shotType]], hand);
    landingRadius = radiusForRuns(runs, shotType);
  }
  const wagonZone = zoneOfAngle(angle);

  // ── Outcome cross-checks (CLAUDE.md §4) ────────────────────────────────────
  if (runs === 6) {
    landingRadius = 1;
    if (trajectory !== "flat" && trajectory !== "skier") trajectory = "lofted";
  } else if (runs === 4) {
    landingRadius = 1;
    trajectory ??= "ground";
  }
  trajectory ??= shotType === "loft" ? "lofted" : "ground";
  // Wickets that never leave the square.
  if (wicketKind === "bowled" || wicketKind === "lbw") landingRadius = 0.02;
  if (wicketKind === "stumped") landingRadius = 0.03;

  return {
    deliveryType,
    length,
    line,
    shotType,
    wagonZone,
    trajectory,
    landingRadius: Math.min(Math.max(landingRadius, 0), 1),
    ...(fielderRole ? { fielderRole } : {}),
    runsScored: physicalRuns(event),
    isBoundary,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/** `event.synth` when a smarter stage already ran, else Stage-1 on the spot. */
export function shotFor(event: BallEvent, ctx?: SynthesizeContext): SynthesizedShot {
  return event.synth ?? synthesizeShot(event, ctx);
}
