/**
 * Shared shot-scene geometry — pure helpers used by the 2D pitch map (client),
 * the Phase-5 wagon wheels and bowler maps (server-rendered), and anything
 * else that turns a `SynthesizedShot` into a direction + color on a field.
 */
import type { BallEvent, SynthesizedShot } from "@/lib/providers/types";
import { FIELD_SPOTS, ZONE_CENTER_ANGLE, zoneOfAngle } from "./field";

/** Deterministic per-ball jitter so overlapping shots fan out on the wheel. */
export function shotSeed(e: BallEvent): number {
  return e.innings * 211 + e.over * 13 + e.ball * 7 + e.runs.total * 3;
}

/**
 * Direction for a shot (deg, 0 = straight, +leg/−off for a right-hander).
 * A named fielder pins the exact angle (sign-corrected against the zone, which
 * already carries left-hand mirroring); otherwise the zone center. Jitter
 * keeps an accumulated wheel organic.
 */
export function shotAngle(shot: SynthesizedShot, seed: number): number {
  let base: number;
  if (shot.fielderRole) {
    base = FIELD_SPOTS[shot.fielderRole].angle;
    if (zoneOfAngle(base) !== shot.wagonZone) base = -base; // left-hander mirror
  } else {
    base = ZONE_CENTER_ANGLE[shot.wagonZone];
  }
  return base + ((seed % 13) - 6) * 1.7;
}

/** Semantic outcome color (CLAUDE.md §7): wicket red, four blue, six violet, runs gold. */
export function outcomeColor(e: BallEvent, shot: SynthesizedShot): string {
  if (e.wicket) return "#E5484D";
  if (e.runs.batter === 6) return "#8B5CF6";
  if (e.runs.batter === 4) return "#3B82F6";
  if (shot.runsScored > 0) return "#F5B82E";
  return "#93A1B0";
}
