/**
 * The Shot Synthesizer (Phase 3) — commentary + ball data → SynthesizedShot.
 * Pure TypeScript, deterministic, unit-tested to death: it IS the product.
 */
export { synthesizeShot, shotFor, normalizeText, type SynthesizeContext } from "./synthesize";
export {
  FIELD_SPOTS,
  ZONE_CENTER_ANGLE,
  findFieldingPosition,
  mirrorAngle,
  zoneOfAngle,
  type FieldSpot,
  type WagonZone,
} from "./field";
