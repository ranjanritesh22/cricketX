/**
 * Ball choreography (Phase 4, CLAUDE.md §5.3) — turns a BallEvent + its
 * SynthesizedShot into a deterministic, timed 3D scene: run-up → release →
 * pitch → shot → flight to the wagon zone → runs / boundary / wicket → settle.
 *
 * Pure TypeScript with plain vectors — NO three.js imports. This module ships
 * in the main bundle (the panel needs scene durations to schedule its playback
 * queue before the lazy 3D chunk loads) and is unit-tested without WebGL.
 *
 * World space: meters, field center at (0,0,0), Y up. The pitch runs along Z:
 * striker's stumps at z=+PITCH_HALF, bowler's stumps at z=−PITCH_HALF. Shot
 * angles reuse the synthesizer convention (0° = straight over the bowler,
 * +leg / −off for a right-hander) via dir = (−sin θ, 0, −cos θ) — the exact
 * mapping the 2D pitch map uses, so both views agree ball for ball.
 */
import type { BallEvent, FieldingPosition, SynthesizedShot, WicketKind } from "@/lib/providers/types";
import { FIELD_SPOTS, ZONE_CENTER_ANGLE, zoneOfAngle } from "@/lib/synth";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Boundary semi-axes in meters (from the venue theme). */
export interface FieldGeom {
  rx: number;
  rz: number;
}

export const PITCH_HALF = 10.06; // stumps-to-center of a 20.12 m pitch
export const STRIKER = { x: 0, y: 0, z: PITCH_HALF } as const;
export const BOWLER_STUMPS = { x: 0, y: 0, z: -PITCH_HALF } as const;
export const KEEPER_SPOT = { x: 0, y: 0, z: PITCH_HALF + 2.2 } as const;
export const RUNUP_START_Z = -PITCH_HALF - 7.5;

// ── Field geometry ────────────────────────────────────────────────────────────

/** Distance (m) from the striker's stumps to the rope along a synth angle. */
export function boundaryDistance(angleDeg: number, geom: FieldGeom): number {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = -Math.sin(rad);
  const dz = -Math.cos(rad);
  const px = STRIKER.x / geom.rx;
  const pz = STRIKER.z / geom.rz;
  const qx = dx / geom.rx;
  const qz = dz / geom.rz;
  const a = qx * qx + qz * qz;
  const b = 2 * (px * qx + pz * qz);
  const c = px * px + pz * pz - 1;
  return (-b + Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
}

/** World point for a synth angle × 0..1 boundary fraction from the striker. */
export function fieldPoint(angleDeg: number, frac: number, geom: FieldGeom): Vec3 {
  const rad = (angleDeg * Math.PI) / 180;
  const dist = boundaryDistance(angleDeg, geom) * frac;
  return { x: STRIKER.x - Math.sin(rad) * dist, y: 0, z: STRIKER.z - Math.cos(rad) * dist };
}

/** Deterministic per-ball jitter seed — same formula as the 2D pitch map. */
export function seedOf(e: BallEvent): number {
  return e.innings * 211 + e.over * 13 + e.ball * 7 + e.runs.total * 3;
}

/**
 * Direction for a shot: a named fielder pins the exact angle (sign-corrected
 * against the zone, which carries left-hand mirroring), else the zone center.
 */
export function angleForShot(shot: SynthesizedShot, seed: number): number {
  let base: number;
  if (shot.fielderRole) {
    base = FIELD_SPOTS[shot.fielderRole].angle;
    if (zoneOfAngle(base) !== shot.wagonZone) base = -base;
  } else {
    base = ZONE_CENTER_ANGLE[shot.wagonZone];
  }
  return base + ((seed % 13) - 6) * 1.7;
}

// ── Fielder placement (CLAUDE.md §5.2) ───────────────────────────────────────

/** Standard presets by match phase; exactly 9 outfielders (+ keeper + bowler). */
export function fieldPreset(over: number, deliveryType: SynthesizedShot["deliveryType"], oversPerInnings = 20): FieldingPosition[] {
  const phase = over / Math.max(oversPerInnings, 1);
  if (phase < 0.3) {
    // powerplay ring
    return ["slip", "gully", "point", "cover", "mid-off", "mid-on", "midwicket", "square-leg", "fine-leg"];
  }
  if (phase >= 0.75) {
    // death spread
    return ["third-man", "deep-point", "sweeper-cover", "long-off", "long-on", "deep-midwicket", "deep-square-leg", "deep-fine-leg", "cover"];
  }
  if (deliveryType === "spin") {
    return ["short-third", "point", "cover", "long-off", "long-on", "deep-midwicket", "square-leg", "deep-square-leg", "short-fine-leg"];
  }
  return ["third-man", "point", "extra-cover", "mid-off", "long-on", "deep-midwicket", "square-leg", "deep-fine-leg", "slip"];
}

export interface PlacedFielder {
  position: FieldingPosition;
  spot: Vec3;
}

/** World spot for a canonical fielding position (sign-corrected to a zone side). */
export function fielderSpot(position: FieldingPosition, geom: FieldGeom, matchZoneAngle?: number): Vec3 {
  const spec = FIELD_SPOTS[position];
  let angle = spec.angle;
  if (matchZoneAngle !== undefined && Math.sign(matchZoneAngle) !== 0 && Math.sign(angle) !== Math.sign(matchZoneAngle)) {
    // The shot went to the mirrored side (left-hander) — flip the interceptor.
    angle = -angle;
  }
  return fieldPoint(angle, spec.radius, geom);
}

/**
 * Place the 9 outfielders for this ball. If the synth named an interceptor,
 * it replaces the angularly-nearest preset slot so the named fielder exists.
 */
export function placeFielders(event: BallEvent, shot: SynthesizedShot, geom: FieldGeom, oversPerInnings = 20): PlacedFielder[] {
  const preset = fieldPreset(event.over, shot.deliveryType, oversPerInnings);
  const named = shot.fielderRole && shot.fielderRole !== "wicketkeeper" ? shot.fielderRole : undefined;
  let slots = preset.slice();
  if (named && !slots.includes(named)) {
    const nAngle = FIELD_SPOTS[named].angle;
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < slots.length; i += 1) {
      const diff = Math.abs(FIELD_SPOTS[slots[i]!].angle - nAngle);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = i;
      }
    }
    slots = slots.slice();
    slots[best] = named;
  }
  const shotAngle = angleForShot(shot, seedOf(event));
  return slots.map((position) => ({
    position,
    spot: fielderSpot(position, geom, position === named ? shotAngle : undefined),
  }));
}

// ── The scene ────────────────────────────────────────────────────────────────

export interface BallScene {
  // Timing (ms from scene start). release < bounce < contact ≤ land < total.
  tRelease: number;
  tBounce: number;
  tContact: number;
  tLand: number;
  total: number;
  // Key points.
  release: Vec3;
  bounce: Vec3;
  contact: Vec3;
  land: Vec3;
  /** Peak height of the shot arc (m). */
  apex: number;
  /** Synth angle the shot travels along. */
  angle: number;
  // Semantics for the renderer.
  deliveryType: SynthesizedShot["deliveryType"];
  trajectory: SynthesizedShot["trajectory"];
  shotType: SynthesizedShot["shotType"];
  /** Batter actually makes contact and the ball leaves the bat. */
  swing: boolean;
  /** Physical runs to shuttle (0 for boundaries and most wickets). */
  runs: number;
  isFour: boolean;
  isSix: boolean;
  wicketKind?: WicketKind;
  /** Meters the striker advances down the pitch (stumped scene). */
  batterAdvance: number;
  /** The interceptor, when the synth named one. */
  fielder?: PlacedFielder;
  /** Low parser confidence — render conservatively, skip flourishes. */
  generic: boolean;
}

const NO_CONTACT: ReadonlySet<SynthesizedShot["shotType"]> = new Set(["missed", "leave"]);

/** Batter contact height (m) by parsed length. */
function contactHeight(length: SynthesizedShot["length"]): number {
  switch (length) {
    case "bouncer": return 1.5;
    case "short": return 1.05;
    case "good": return 0.7;
    case "full": return 0.4;
    case "yorker": return 0.12;
  }
}

/** Where the delivery pitches, from the striker's stumps (m). */
function bounceOffset(length: SynthesizedShot["length"]): number {
  switch (length) {
    case "bouncer": return 11.5;
    case "short": return 9;
    case "good": return 6.5;
    case "full": return 3.5;
    case "yorker": return 0.8;
  }
}

function lineOffset(line: SynthesizedShot["line"]): number {
  // Off side is +x in this world (angle −θ → +x): see the dir convention above.
  switch (line) {
    case "wide-off": return 0.85;
    case "off": return 0.25;
    case "middle": return 0;
    case "leg": return -0.25;
    case "wide-leg": return -0.85;
  }
}

export function buildScene(event: BallEvent, shot: SynthesizedShot, geom: FieldGeom): BallScene {
  const seed = seedOf(event);
  const angle = angleForShot(shot, seed);
  const generic = shot.confidence < 0.5;
  const wicketKind = event.wicket?.kind;

  const runUp = 1250;
  const deliveryMs = shot.deliveryType === "spin" ? 640 : 470;
  const tRelease = runUp;
  const tBounce = tRelease + deliveryMs * 0.62;
  const tContact = tRelease + deliveryMs;

  const release: Vec3 = { x: 0.35, y: 2.25, z: -PITCH_HALF - 0.9 };
  const lx = lineOffset(shot.line);
  const bounce: Vec3 = { x: lx * 0.8, y: 0, z: STRIKER.z - bounceOffset(shot.length) };
  const contact: Vec3 = { x: lx, y: contactHeight(shot.length), z: STRIKER.z - 0.4 };

  const swing = !NO_CONTACT.has(shot.shotType) && wicketKind !== "bowled" && wicketKind !== "lbw";

  // ── Where the ball ends up, and when ──
  let land: Vec3;
  let flightMs: number;
  let apex: number;

  if (wicketKind === "bowled" || wicketKind === "lbw") {
    land = { x: 0, y: 0.35, z: STRIKER.z };
    flightMs = 90;
    apex = contact.y;
  } else if (wicketKind === "stumped" || !swing) {
    // Through to the keeper (missed / left / stumping).
    land = { x: contact.x * 0.6, y: 0.75, z: KEEPER_SPOT.z };
    flightMs = 300;
    apex = contact.y;
  } else {
    const frac = Math.max(generic ? Math.min(shot.landingRadius, 0.55) : shot.landingRadius, 0.05);
    land = fieldPoint(angle, frac, geom);
    const dist = Math.hypot(land.x - STRIKER.x, land.z - STRIKER.z);
    const trajectory = generic && shot.trajectory !== "ground" ? "ground" : shot.trajectory;
    if (trajectory === "skier") {
      apex = 26;
      flightMs = 1950;
    } else if (trajectory === "lofted") {
      apex = Math.max(9, dist * 0.32);
      flightMs = Math.min(700 + dist * 22, 2300);
    } else if (trajectory === "flat") {
      apex = Math.max(2.2, dist * 0.06);
      flightMs = Math.min(500 + dist * 13, 1500);
    } else {
      apex = 0.55; // rendered as decaying bounces along the carpet
      flightMs = Math.min(600 + dist * 17, 1900);
    }
    if (wicketKind === "caught" || wicketKind === "caught and bowled") {
      land = { ...land, y: 1.35 }; // taken in front of the chest
    }
  }

  // Stumped drama: the advance happens during the delivery; the "land" moment
  // is the keeper whipping the bails off just after the ball arrives.
  const stumpedHold = wicketKind === "stumped" ? 450 : 0;
  const tLand = tContact + flightMs + stumpedHold;

  const isFour = !event.wicket && event.runs.batter === 4 && shot.isBoundary;
  const isSix = !event.wicket && event.runs.batter === 6;
  const runs = shot.isBoundary || isSix ? 0 : Math.min(event.runs.total, 3);

  // ── Outcome window after the ball lands ──
  let outcomeMs: number;
  if (wicketKind) outcomeMs = 1500; // mini-scene + celebrate
  else if (isSix) outcomeMs = 1150; // crowd flash + confetti
  else if (isFour) outcomeMs = 900; // rope flash
  else if (runs > 0) outcomeMs = 380 + runs * 620;
  else outcomeMs = 480;

  const total = tLand + outcomeMs + 550; // + camera settle

  const fielder =
    shot.fielderRole && shot.fielderRole !== "wicketkeeper"
      ? { position: shot.fielderRole, spot: fielderSpot(shot.fielderRole, geom, angle) }
      : undefined;

  return {
    tRelease,
    tBounce,
    tContact,
    tLand,
    total,
    release,
    bounce,
    contact,
    land,
    apex,
    angle,
    deliveryType: shot.deliveryType,
    trajectory: shot.trajectory,
    shotType: shot.shotType,
    swing,
    runs,
    isFour,
    isSix,
    wicketKind,
    batterAdvance: wicketKind === "stumped" ? 1.9 : 0,
    fielder,
    generic,
  };
}

/** Panel scheduler hook — total playback time of the 3D scene for this ball. */
export function playbackMillis3D(event: BallEvent, shot: SynthesizedShot, geom: FieldGeom): number {
  return buildScene(event, shot, geom).total;
}

// ── Samplers (called per frame by the renderer; kept pure for tests) ─────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Bowler root position over the scene (run-up, release stride, follow-through). */
export function bowlerPositionAt(scene: BallScene, t: number): Vec3 {
  if (t <= scene.tRelease) {
    const u = clamp01(t / scene.tRelease);
    const eased = u * u * (3 - 2 * u); // gathers pace into the crease
    return { x: 0.4, y: 0, z: lerp(RUNUP_START_Z, -PITCH_HALF - 0.7, eased) };
  }
  const u = clamp01((t - scene.tRelease) / 600);
  return { x: lerp(0.4, 0.9, u), y: 0, z: lerp(-PITCH_HALF - 0.7, -PITCH_HALF + 1.4, u) };
}

/** Ball position over the scene — the single source of truth for the flight. */
export function ballPositionAt(scene: BallScene, t: number): Vec3 {
  if (t <= scene.tRelease) {
    // In the bowler's hand through the run-up.
    const hand = bowlerPositionAt(scene, t);
    return { x: hand.x + 0.25, y: 1.55, z: hand.z + 0.15 };
  }
  if (t <= scene.tBounce) {
    const u = clamp01((t - scene.tRelease) / (scene.tBounce - scene.tRelease));
    const p = lerp3(scene.release, scene.bounce, u);
    // Slight over-arm dip on the way down.
    p.y = scene.release.y * (1 - u) * (1 - u * 0.35) + scene.bounce.y * u;
    return p;
  }
  if (t <= scene.tContact) {
    const u = clamp01((t - scene.tBounce) / Math.max(scene.tContact - scene.tBounce, 1));
    const p = lerp3(scene.bounce, scene.contact, u);
    p.y = lerp(scene.bounce.y, scene.contact.y, u * u); // rises off the pitch
    return p;
  }
  const flightEnd = scene.wicketKind === "stumped" ? scene.tLand - 450 : scene.tLand;
  if (t <= flightEnd) {
    const u = clamp01((t - scene.tContact) / Math.max(flightEnd - scene.tContact, 1));
    const eased = scene.trajectory === "ground" ? 1 - (1 - u) * (1 - u) : u;
    const p = lerp3(scene.contact, scene.land, eased);
    if (scene.swing && !scene.wicketKind?.startsWith("ca")) {
      if (scene.trajectory === "ground" && scene.apex < 1) {
        // Decaying bounces along the carpet.
        const bounces = 3;
        p.y = Math.abs(Math.sin(u * Math.PI * bounces)) * scene.apex * (1 - u * 0.8) + scene.land.y * u;
      } else {
        p.y = lerp(scene.contact.y, scene.land.y, u) + Math.sin(u * Math.PI) * scene.apex;
      }
    } else if (scene.swing) {
      // Caught: clean single arc into the fielder's hands.
      p.y = lerp(scene.contact.y, scene.land.y, u) + Math.sin(u * Math.PI) * scene.apex;
    } else {
      p.y = lerp(scene.contact.y, scene.land.y, u);
    }
    return p;
  }
  return scene.land;
}

/**
 * Runner progress: 0 = in crease, each whole number = a completed run.
 * The renderer maps fraction ↔ crease-to-crease position (odd runs = swapped).
 */
export function runProgressAt(scene: BallScene, t: number): number {
  if (scene.runs <= 0) return 0;
  const start = scene.tContact + 200;
  const perRun = 620;
  if (t <= start) return 0;
  return Math.min((t - start) / perRun, scene.runs);
}

/** Striker advance (m toward the bowler) — the stumping mini-scene. */
export function strikerAdvanceAt(scene: BallScene, t: number): number {
  if (scene.batterAdvance <= 0) return 0;
  const from = scene.tRelease;
  const to = scene.tContact + 150;
  return scene.batterAdvance * clamp01((t - from) / Math.max(to - from, 1));
}
