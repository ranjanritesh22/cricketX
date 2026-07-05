/**
 * Phase 4 choreography contract tests — the 3D scene is only as trustworthy
 * as this pure timeline, so it gets the same treatment as the parser:
 * timings ordered and inside the ~4–6s spec band, flights that start at the
 * bowler's hand and end at the synthesized zone, and wicket kinds that map to
 * their distinct mini-scenes (CLAUDE.md §5.3).
 */
import { describe, expect, it } from "vitest";
import type { BallEvent } from "@/lib/providers/types";
import { shotFor } from "@/lib/synth";
import {
  ballPositionAt,
  boundaryDistance,
  bowlerPositionAt,
  buildScene,
  fieldPreset,
  placeFielders,
  playbackMillis3D,
  runProgressAt,
  strikerAdvanceAt,
  PITCH_HALF,
  STRIKER,
  type FieldGeom,
} from "../choreography";

const GEOM: FieldGeom = { rx: 62, rz: 66 };

function ball(commentaryText: string, over: Partial<BallEvent> = {}): BallEvent {
  return {
    matchId: "m1",
    innings: 1,
    over: 8,
    ball: 3,
    bowlerId: "b1",
    batterId: "s1",
    nonStrikerId: "n1",
    runs: { batter: 0, extras: 0, total: 0 },
    commentaryText,
    timestamp: "2026-07-03T10:00:00Z",
    ...over,
  };
}

function sceneOf(e: BallEvent) {
  return buildScene(e, shotFor(e), GEOM);
}

describe("buildScene timings", () => {
  const cases: [string, BallEvent][] = [
    ["dot", ball("Bumrah to Salt, no run, defended back down the pitch")],
    ["single", ball("Rashid to Axar, 1 run, cuts to the right of sweeper cover", { runs: { batter: 1, extras: 0, total: 1 } })],
    ["four", ball("Kuldeep to Jacks, FOUR, crunched through the covers, races to the boundary", { runs: { batter: 4, extras: 0, total: 4 } })],
    ["six", ball("Bumrah to Brook, SIX, lofted over long-on, huge", { runs: { batter: 6, extras: 0, total: 6 } })],
    [
      "bowled",
      ball("Bumrah to Buttler, OUT! Bowled him, through the gate", {
        wicket: { kind: "bowled", playerOutId: "s1", fielderIds: [] },
      }),
    ],
  ];

  it.each(cases)("orders the phases and stays in the spec band — %s", (_name, e) => {
    const s = sceneOf(e);
    expect(s.tRelease).toBeGreaterThan(0);
    expect(s.tBounce).toBeGreaterThan(s.tRelease);
    expect(s.tContact).toBeGreaterThan(s.tBounce);
    expect(s.tLand).toBeGreaterThanOrEqual(s.tContact);
    expect(s.total).toBeGreaterThan(s.tLand);
    expect(s.total).toBeGreaterThanOrEqual(2500);
    expect(s.total).toBeLessThanOrEqual(7000);
    expect(playbackMillis3D(e, shotFor(e), GEOM)).toBe(s.total);
  });
});

describe("ball flight", () => {
  it("starts in the bowler's hand and passes through the contact point", () => {
    const s = sceneOf(ball("Archer to Kohli, no run, good length on off, defended"));
    const start = ballPositionAt(s, 0);
    expect(start.z).toBeLessThan(-PITCH_HALF); // at the top of the run-up
    const bowlerAtRelease = bowlerPositionAt(s, s.tRelease);
    expect(Math.abs(bowlerAtRelease.z - -(PITCH_HALF + 0.7))).toBeLessThan(0.3);
    const atContact = ballPositionAt(s, s.tContact);
    expect(Math.abs(atContact.z - s.contact.z)).toBeLessThan(0.01);
    expect(Math.abs(atContact.y - s.contact.y)).toBeLessThan(0.05);
  });

  it("a FOUR lands on the rope in the parsed zone", () => {
    const e = ball("Kuldeep to Jacks, FOUR, cut hard past point, races away", { runs: { batter: 4, extras: 0, total: 4 } });
    const s = sceneOf(e);
    expect(s.isFour).toBe(true);
    expect(s.runs).toBe(0); // no shuttling on boundaries
    // Landing sits on the boundary ellipse.
    const onEllipse = (s.land.x / GEOM.rx) ** 2 + (s.land.z / GEOM.rz) ** 2;
    expect(onEllipse).toBeGreaterThan(0.94);
    expect(onEllipse).toBeLessThanOrEqual(1.02);
    // Cut shot: off side is +x in world space.
    expect(s.land.x).toBeGreaterThan(0);
  });

  it("a SIX flies high over the rope with a lofted apex", () => {
    const e = ball("Hardik to Livingstone, SIX! Slog-swept miles over deep midwicket", { runs: { batter: 6, extras: 0, total: 6 } });
    const s = sceneOf(e);
    expect(s.isSix).toBe(true);
    expect(s.apex).toBeGreaterThanOrEqual(8);
    const mid = ballPositionAt(s, (s.tContact + s.tLand) / 2);
    expect(mid.y).toBeGreaterThan(5);
  });

  it("a grounded single stays on the carpet", () => {
    const e = ball("Rashid to Axar, 1 run, worked along the ground to deep midwicket", { runs: { batter: 1, extras: 0, total: 1 } });
    const s = sceneOf(e);
    for (let i = 1; i <= 8; i += 1) {
      const t = s.tContact + ((s.tLand - s.tContact) * i) / 9;
      expect(ballPositionAt(s, t).y).toBeLessThan(1.2);
    }
    expect(s.runs).toBe(1);
  });
});

describe("wicket mini-scenes (§5.3 step 7)", () => {
  it("bowled: no swing contact, ball ends at the striker's stumps", () => {
    const e = ball("Bumrah to Salt, OUT! Cleaned him up, off stump pegged back", {
      wicket: { kind: "bowled", playerOutId: "s1", fielderIds: [] },
    });
    const s = sceneOf(e);
    expect(s.wicketKind).toBe("bowled");
    expect(s.swing).toBe(false);
    expect(Math.abs(s.land.z - STRIKER.z)).toBeLessThan(0.5);
    expect(Math.abs(s.land.x)).toBeLessThan(0.5);
  });

  it("stumped: the batter advances down the pitch and the keeper completes it", () => {
    const e = ball(
      "Rashid to Pant, OUT! Deceives him with a googly, Pant charges, misses, Buttler lightning quick with the stumping",
      { wicket: { kind: "stumped", playerOutId: "s1", fielderIds: ["k1"] } },
    );
    const s = sceneOf(e);
    expect(s.wicketKind).toBe("stumped");
    expect(s.batterAdvance).toBeGreaterThan(0);
    expect(strikerAdvanceAt(s, s.tContact + 200)).toBeGreaterThan(1);
    // The ball carries through to the keeper, not into the field.
    expect(s.land.z).toBeGreaterThan(PITCH_HALF);
  });

  it("caught: the ball arrives at catching height at the named fielder", () => {
    const e = ball("Kuldeep to Brook, OUT! Skied it, taken safely by long-on running in", {
      wicket: { kind: "caught", playerOutId: "s1", fielderIds: ["f1"] },
    });
    const s = sceneOf(e);
    expect(s.wicketKind).toBe("caught");
    expect(s.land.y).toBeGreaterThan(1);
    expect(s.land.y).toBeLessThan(2);
  });
});

describe("runners", () => {
  it("shuttles exactly the scored runs and finishes them before the scene ends", () => {
    const e = ball("Wood to SKY, 2 runs, clipped into the gap at deep square leg", { runs: { batter: 2, extras: 0, total: 2 } });
    const s = sceneOf(e);
    expect(s.runs).toBe(2);
    expect(runProgressAt(s, 0)).toBe(0);
    expect(runProgressAt(s, s.total)).toBe(2);
  });
});

describe("ambiguity policy (CLAUDE.md §4)", () => {
  it("low-confidence balls are clamped to a conservative grounded scene", () => {
    const e = ball("xyzzy blorp", { runs: { batter: 0, extras: 0, total: 0 } });
    const shot = shotFor(e);
    expect(shot.confidence).toBeLessThan(0.5);
    const s = buildScene(e, shot, GEOM);
    expect(s.generic).toBe(true);
    expect(s.apex).toBeLessThan(1); // never a spectacular arc for a mystery ball
  });
});

describe("fielder placement", () => {
  it("every phase preset has exactly 9 distinct outfielders", () => {
    for (const [over, type] of [
      [2, "pace"],
      [10, "spin"],
      [10, "pace"],
      [18, "pace"],
    ] as const) {
      const preset = fieldPreset(over, type);
      expect(preset).toHaveLength(9);
      expect(new Set(preset).size).toBe(9);
    }
  });

  it("the named interceptor is snapped into the field", () => {
    const e = ball("Rashid to Axar, 1 run, cuts to the right of sweeper cover", {
      runs: { batter: 1, extras: 0, total: 1 },
    });
    const shot = shotFor(e);
    expect(shot.fielderRole).toBe("sweeper-cover");
    const placed = placeFielders(e, shot, GEOM);
    expect(placed).toHaveLength(9);
    expect(placed.some((p) => p.position === "sweeper-cover")).toBe(true);
    // Every fielder stands inside the rope.
    for (const p of placed) {
      expect((p.spot.x / GEOM.rx) ** 2 + (p.spot.z / GEOM.rz) ** 2).toBeLessThanOrEqual(1.01);
    }
  });
});

describe("field geometry", () => {
  it("boundary distance shrinks straight ahead vs behind (striker is off-center)", () => {
    // The striker stands at +z, so the straight boundary (toward −z) is farther.
    expect(boundaryDistance(0, GEOM)).toBeGreaterThan(boundaryDistance(180, GEOM));
  });
});
