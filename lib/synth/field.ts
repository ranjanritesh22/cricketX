/**
 * Field geometry for the Shot Synthesizer (Phase 3, CLAUDE.md §4).
 *
 * Coordinate system (top-down, striker's stumps at the origin):
 *   - `angle` is degrees from straight down the ground (over the bowler's head).
 *   - Positive angles sweep to the LEG side of a right-hand batter,
 *     negative to the OFF side; ±180° is directly behind the keeper.
 *   - `radius` is a 0..1 fraction of the boundary distance.
 *
 * All coordinates below are for a right-hand batter; `mirrorAngle` flips them
 * for lefties (handedness comes from squad data when available).
 *
 * Wagon zones follow the standard 8-zone wheel, zone 1 = fine leg for a
 * right-hander (see `SynthesizedShot.wagonZone` in the domain types), sweeping
 * leg side → straight → off side: 1 fine leg, 2 square leg, 3 midwicket,
 * 4 long-on, 5 long-off, 6 cover, 7 point, 8 third man.
 */
import { FIELDING_POSITIONS, type BattingHand, type FieldingPosition } from "@/lib/providers/types";
import type { SynthesizedShot } from "@/lib/providers/types";

export type WagonZone = SynthesizedShot["wagonZone"];

export interface FieldSpot {
  /** Degrees from straight; +leg / −off for a right-hander. */
  angle: number;
  /** 0..1 fraction of boundary distance. */
  radius: number;
}

/** Flip a right-hander coordinate for a left-hand batter. */
export function mirrorAngle(angle: number, hand: BattingHand = "right"): number {
  return hand === "left" ? -angle : angle;
}

/** Standard 8-zone wagon wheel from a field angle (already mirrored if needed). */
export function zoneOfAngle(angle: number): WagonZone {
  // Normalize into (-180, 180].
  let a = ((angle + 180) % 360 + 360) % 360 - 180;
  if (a === -180) a = 180;
  if (a >= 135) return 1; // fine leg
  if (a >= 90) return 2; // square leg
  if (a >= 45) return 3; // midwicket
  if (a >= 0) return 4; // long-on / straight leg side
  if (a >= -45) return 5; // long-off / straight off side
  if (a >= -90) return 6; // cover
  if (a >= -135) return 7; // point
  return 8; // third man
}

/** Representative angle for a zone (RH batter) — used when only a zone is known. */
export const ZONE_CENTER_ANGLE: Record<WagonZone, number> = {
  1: 157.5,
  2: 112.5,
  3: 67.5,
  4: 22.5,
  5: -22.5,
  6: -67.5,
  7: -112.5,
  8: -157.5,
};

/**
 * The ~40-position dictionary (CLAUDE.md §4 Stage 1), keyed by the canonical
 * `FieldingPosition` ids from the domain types. Radii: catching ≈ 0.05–0.15,
 * inner ring ≈ 0.35–0.45, boundary riders ≈ 0.9–0.95.
 */
export const FIELD_SPOTS: Record<FieldingPosition, FieldSpot> = {
  wicketkeeper: { angle: 180, radius: 0.05 },
  slip: { angle: -163, radius: 0.09 },
  "leg-slip": { angle: 168, radius: 0.09 },
  gully: { angle: -137, radius: 0.14 },
  "leg-gully": { angle: 140, radius: 0.14 },
  "silly-point": { angle: -100, radius: 0.07 },
  "silly-mid-off": { angle: -28, radius: 0.08 },
  "silly-mid-on": { angle: 28, radius: 0.08 },
  "short-leg": { angle: 85, radius: 0.07 },
  point: { angle: -100, radius: 0.4 },
  "backward-point": { angle: -118, radius: 0.4 },
  "cover-point": { angle: -82, radius: 0.4 },
  cover: { angle: -65, radius: 0.42 },
  "extra-cover": { angle: -47, radius: 0.42 },
  "mid-off": { angle: -25, radius: 0.42 },
  "mid-on": { angle: 25, radius: 0.42 },
  midwicket: { angle: 55, radius: 0.42 },
  "square-leg": { angle: 92, radius: 0.42 },
  "backward-square-leg": { angle: 112, radius: 0.42 },
  "short-third": { angle: -145, radius: 0.28 },
  "short-fine-leg": { angle: 142, radius: 0.28 },
  "short-midwicket": { angle: 55, radius: 0.22 },
  "short-cover": { angle: -65, radius: 0.22 },
  "deep-point": { angle: -100, radius: 0.92 },
  "deep-backward-point": { angle: -118, radius: 0.92 },
  "sweeper-cover": { angle: -62, radius: 0.92 },
  "deep-cover": { angle: -65, radius: 0.9 },
  "deep-extra-cover": { angle: -47, radius: 0.92 },
  "long-off": { angle: -22, radius: 0.95 },
  "long-on": { angle: 22, radius: 0.95 },
  "deep-midwicket": { angle: 55, radius: 0.92 },
  "cow-corner": { angle: 38, radius: 0.95 },
  "deep-square-leg": { angle: 92, radius: 0.92 },
  "deep-backward-square-leg": { angle: 112, radius: 0.92 },
  "deep-fine-leg": { angle: 147, radius: 0.92 },
  "fine-leg": { angle: 147, radius: 0.75 },
  "long-leg": { angle: 160, radius: 0.9 },
  "third-man": { angle: -150, radius: 0.88 },
  "deep-third": { angle: -150, radius: 0.92 },
  "long-stop": { angle: 178, radius: 0.9 },
};

/**
 * Commentary spellings → canonical position. Keys are matched as whole-word
 * phrases against normalized text (lowercase, punctuation → spaces), longest
 * phrase first, so "sweeper cover" wins over "cover" and "deep backward point"
 * over "backward point".
 */
const POSITION_ALIASES: Record<string, FieldingPosition> = {
  // straight & ring
  "mid off": "mid-off",
  "mid on": "mid-on",
  "long off": "long-off",
  "long on": "long-on",
  cover: "cover",
  covers: "cover",
  "extra cover": "extra-cover",
  "deep extra cover": "deep-extra-cover",
  "short cover": "short-cover",
  "short extra cover": "short-cover",
  "deep cover": "deep-cover",
  "sweeper cover": "sweeper-cover",
  sweeper: "sweeper-cover",
  point: "point",
  "backward point": "backward-point",
  "deep backward point": "deep-backward-point",
  "cover point": "cover-point",
  "deep point": "deep-point",
  "silly point": "silly-point",
  "silly mid off": "silly-mid-off",
  "silly mid on": "silly-mid-on",
  // leg side
  midwicket: "midwicket",
  "mid wicket": "midwicket",
  "deep midwicket": "deep-midwicket",
  "deep mid wicket": "deep-midwicket",
  "short midwicket": "short-midwicket",
  "short mid wicket": "short-midwicket",
  "cow corner": "cow-corner",
  "square leg": "square-leg",
  "backward square leg": "backward-square-leg",
  "deep backward square leg": "deep-backward-square-leg",
  "deep square leg": "deep-square-leg",
  "deep square": "deep-square-leg",
  "short leg": "short-leg",
  "leg gully": "leg-gully",
  "leg slip": "leg-slip",
  "fine leg": "fine-leg",
  "deep fine leg": "deep-fine-leg",
  "short fine leg": "short-fine-leg",
  "long leg": "long-leg",
  "to 45": "short-fine-leg", // "tickled down to 45" — bare "45" would false-match run counts
  // behind the wicket, off side
  "third man": "third-man",
  "deep third man": "deep-third",
  "deep third": "deep-third",
  "short third man": "short-third",
  "short third": "short-third",
  gully: "gully",
  slip: "slip",
  slips: "slip",
  "first slip": "slip",
  "second slip": "slip",
  cordon: "slip",
  "long stop": "long-stop",
  keeper: "wicketkeeper",
  "the keeper": "wicketkeeper",
  wicketkeeper: "wicketkeeper",
  "wicket keeper": "wicketkeeper",
};

/** Longest-phrase-first list, precomputed once. */
const ALIAS_ENTRIES: ReadonlyArray<[string, FieldingPosition]> = Object.entries(POSITION_ALIASES).sort(
  (a, b) => b[0].length - a[0].length,
);

/**
 * Find the fielding position named in normalized commentary text (see
 * `normalizeText` in the parser). Longer aliases claim their span first
 * ("sweeper cover" beats "cover"); among distinct mentions the LAST one wins,
 * because commentary names the final interceptor/region last — "under edge
 * past the keeper, one run to third man" ends up at third man.
 */
export function findFieldingPosition(normalizedText: string): FieldingPosition | undefined {
  let best: { index: number; position: FieldingPosition } | undefined;
  let text = normalizedText;
  for (const [alias, position] of ALIAS_ENTRIES) {
    const needle = ` ${alias} `;
    let from = 0;
    for (let idx = text.indexOf(needle, from); idx !== -1; idx = text.indexOf(needle, from)) {
      if (!best || idx > best.index) best = { index: idx, position };
      // Mask the span so shorter aliases can't re-match inside it.
      text = text.slice(0, idx + 1) + "#".repeat(alias.length) + text.slice(idx + 1 + alias.length);
      from = idx + alias.length;
    }
  }
  return best?.position;
}

/**
 * Named strokes that carry their own direction (a cover drive goes to cover,
 * a hook goes fine). Used when no fielder is named — weaker evidence than a
 * position, stronger than a bare verb. Angles are RH-batter, mirrored the
 * same way as positions; note the reverse sweep and switch hit genuinely
 * invert to the off side.
 */
export const DIRECTIONAL_SHOTS: ReadonlyArray<{ phrases: readonly string[]; angle: number }> = [
  { phrases: ["cover drive", "cover drives", "cover driven"], angle: -60 },
  { phrases: ["off drive", "off drives", "off driven"], angle: -30 },
  { phrases: ["on drive", "on drives", "on driven"], angle: 30 },
  { phrases: ["straight drive", "straight drives", "down the ground"], angle: 8 },
  { phrases: ["square drive", "square drives"], angle: -85 },
  { phrases: ["square cut", "square cuts"], angle: -105 },
  { phrases: ["late cut", "late cuts"], angle: -140 },
  { phrases: ["upper cut", "upper cuts", "uppercut"], angle: -140 },
  { phrases: ["hook", "hooks", "hooked", "hook shot"], angle: 110 },
  { phrases: ["reverse sweep", "reverse sweeps", "reverse swept", "reverse ramps"], angle: -110 },
  { phrases: ["switch hit", "switch hits"], angle: -65 },
  { phrases: ["paddle", "paddles", "paddled", "paddle sweep", "laps it", "lapped", "lap shot"], angle: 140 },
  { phrases: ["scoop", "scoops", "scooped", "ramps", "ramped", "ramp shot"], angle: 162 },
  { phrases: ["slog sweep", "slog sweeps", "slog swept"], angle: 45 },
  { phrases: ["glance", "glances", "glanced", "leg glance"], angle: 140 },
] as const;

const DIRECTIONAL_ENTRIES: ReadonlyArray<[string, number]> = DIRECTIONAL_SHOTS.flatMap((d) =>
  d.phrases.map((p): [string, number] => [p, d.angle]),
).sort((a, b) => b[0].length - a[0].length);

/** Angle implied by a direction-carrying stroke name, longest phrase first. */
export function findDirectionalAngle(normalizedText: string): number | undefined {
  for (const [phrase, angle] of DIRECTIONAL_ENTRIES) {
    if (normalizedText.includes(` ${phrase} `)) return angle;
  }
  return undefined;
}

/** Every canonical position must have coordinates — asserted by the test suite. */
export const ALL_POSITIONS: readonly FieldingPosition[] = FIELDING_POSITIONS;
