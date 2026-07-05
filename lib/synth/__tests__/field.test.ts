/** Field geometry invariants — the dictionary the whole synthesizer stands on. */
import { describe, expect, it } from "vitest";
import { FIELDING_POSITIONS } from "@/lib/providers/types";
import {
  ALL_POSITIONS,
  FIELD_SPOTS,
  ZONE_CENTER_ANGLE,
  findFieldingPosition,
  mirrorAngle,
  zoneOfAngle,
} from "../field";
import { normalizeText } from "../synthesize";

describe("fielding dictionary", () => {
  it("covers every canonical FieldingPosition with sane polar coordinates", () => {
    for (const position of FIELDING_POSITIONS) {
      const spot = FIELD_SPOTS[position];
      expect(spot, position).toBeDefined();
      expect(Math.abs(spot.angle), `${position} angle`).toBeLessThanOrEqual(180);
      expect(spot.radius, `${position} radius`).toBeGreaterThan(0);
      expect(spot.radius, `${position} radius`).toBeLessThanOrEqual(1);
    }
    expect(ALL_POSITIONS).toEqual(FIELDING_POSITIONS);
  });

  it("resolves every canonical position from its spoken form", () => {
    for (const position of FIELDING_POSITIONS) {
      const spoken = position.replace(/-/g, " ");
      expect(findFieldingPosition(normalizeText(`hit out to ${spoken} for one`)), spoken).toBe(position);
    }
  });

  it("prefers the longest phrase — sweeper cover beats cover, deep beats plain", () => {
    expect(findFieldingPosition(normalizeText("cuts to the right of sweeper cover"))).toBe("sweeper-cover");
    expect(findFieldingPosition(normalizeText("driven to cover"))).toBe("cover");
    expect(findFieldingPosition(normalizeText("out to deep backward square leg"))).toBe("deep-backward-square-leg");
    expect(findFieldingPosition(normalizeText("swept to backward square leg"))).toBe("backward-square-leg");
    expect(findFieldingPosition(normalizeText("tickled down to 45"))).toBe("short-fine-leg");
    expect(findFieldingPosition(normalizeText("nothing about fielders here"))).toBeUndefined();
  });

  it("deep positions patrol the boundary, catchers crowd the bat, ring holds the middle", () => {
    for (const position of FIELDING_POSITIONS) {
      const { radius } = FIELD_SPOTS[position];
      if (/^(deep|long|sweeper|cow)/.test(position)) expect(radius, position).toBeGreaterThanOrEqual(0.7);
      if (/^(silly|slip|leg-slip|leg-gully|gully|wicketkeeper|short-leg)$/.test(position))
        expect(radius, position).toBeLessThanOrEqual(0.2);
    }
  });
});

describe("wagon zones (8-zone wheel, zone 1 = fine leg for RH)", () => {
  it("maps the compass correctly for a right-hander", () => {
    expect(zoneOfAngle(FIELD_SPOTS["fine-leg"].angle)).toBe(1);
    expect(zoneOfAngle(FIELD_SPOTS["square-leg"].angle)).toBe(2);
    expect(zoneOfAngle(FIELD_SPOTS["midwicket"].angle)).toBe(3);
    expect(zoneOfAngle(FIELD_SPOTS["long-on"].angle)).toBe(4);
    expect(zoneOfAngle(FIELD_SPOTS["long-off"].angle)).toBe(5);
    expect(zoneOfAngle(FIELD_SPOTS["cover"].angle)).toBe(6);
    expect(zoneOfAngle(FIELD_SPOTS["point"].angle)).toBe(7);
    expect(zoneOfAngle(FIELD_SPOTS["third-man"].angle)).toBe(8);
  });

  it("zone centers round-trip through zoneOfAngle", () => {
    for (const [zone, angle] of Object.entries(ZONE_CENTER_ANGLE)) {
      expect(zoneOfAngle(angle)).toBe(Number(zone));
    }
  });

  it("mirrors left-handers: their fine leg lands in the RH third-man sector", () => {
    expect(zoneOfAngle(mirrorAngle(FIELD_SPOTS["fine-leg"].angle, "left"))).toBe(8);
    expect(zoneOfAngle(mirrorAngle(FIELD_SPOTS["cover"].angle, "left"))).toBe(3);
    expect(zoneOfAngle(mirrorAngle(FIELD_SPOTS["long-on"].angle, "left"))).toBe(5);
    expect(mirrorAngle(45, "right")).toBe(45);
  });

  it("normalizes any angle into a valid zone", () => {
    for (let a = -720; a <= 720; a += 7) {
      const zone = zoneOfAngle(a);
      expect(zone).toBeGreaterThanOrEqual(1);
      expect(zone).toBeLessThanOrEqual(8);
    }
  });
});
