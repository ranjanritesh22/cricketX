/**
 * Shot Synthesizer suite (CLAUDE.md §4) — table-driven over the hand-written
 * corpus plus generated dictionary sweeps, CI-gated on the headline metric:
 * ≥80% of the 500+ line corpus parsed at confidence ≥0.7 by rules alone.
 */
import { describe, expect, it } from "vitest";
import type { BallEvent } from "@/lib/providers/types";
import { synthesizeShot } from "../synthesize";
import { LENGTH_GROUPS, LINE_GROUPS, PACE_WORDS, SHOT_GROUPS, SPIN_WORDS, TRAJECTORY_GROUPS } from "../lexicon";
import { ALL_POSITIONS, FIELD_SPOTS, zoneOfAngle } from "../field";
import { CORPUS, type CorpusCase } from "./corpus";

function eventFrom(c: CorpusCase, i: number): BallEvent {
  const batter = c.runs ?? 0;
  const extras = c.extras?.runs ?? 0;
  return {
    matchId: "corpus",
    innings: 1,
    over: Math.floor(i / 6),
    ball: (i % 6) + 1,
    bowlerId: "bowler",
    batterId: "batter",
    nonStrikerId: "non-striker",
    runs: { batter, extras, total: batter + extras },
    ...(c.extras ? { extraType: c.extras.type } : {}),
    ...(c.wicket ? { wicket: { kind: c.wicket, playerOutId: "batter", fielderIds: [] } } : {}),
    commentaryText: c.text,
    timestamp: new Date(1700000000000 + i * 40_000).toISOString(),
  };
}

function labelOf(c: CorpusCase): string {
  return c.text.length > 72 ? `${c.text.slice(0, 72)}…` : c.text || "(empty)";
}

// ── Generated sweeps — every dictionary entry through a realistic frame ──────
// These are commentary-shaped sentences too; combined with the hand-written
// corpus the suite runs 500+ distinct lines through the parser.

const sweeps: CorpusCase[] = [];

// Every canonical fielding position, in several natural frames.
for (const position of ALL_POSITIONS) {
  const spoken = position.replace(/-/g, " ");
  const zone = zoneOfAngle(FIELD_SPOTS[position].angle);
  const frames = [
    `Khan to Smith, 1 run, worked away to ${spoken}`,
    `Khan to Smith, no run, pushes it straight to ${spoken}`,
    `Khan to Smith, 2 runs, driven out to ${spoken}, good running`,
    `Khan to Smith, 1 run, tucked into the gap at ${spoken}`,
  ];
  for (const [fi, text] of frames.entries()) {
    sweeps.push({
      text,
      runs: fi === 1 ? 0 : fi === 2 ? 2 : 1,
      expect: { fielderRole: position, wagonZone: zone, minConfidence: 0.7 },
    });
  }
}

// Every shot phrase resolves to its group's shotType.
for (const group of SHOT_GROUPS) {
  for (const phrase of group.phrases) {
    sweeps.push({
      text: `Khan to Smith, 1 run, ${phrase} out to deep cover`,
      runs: 1,
      expect: { shotType: group.shot, minConfidence: 0.7 },
    });
  }
}

// Delivery-type vocabulary.
for (const phrase of SPIN_WORDS) {
  sweeps.push({
    text: `Khan to Smith, 1 run, ${phrase}, worked away to deep midwicket`,
    runs: 1,
    expect: { deliveryType: "spin", minConfidence: 0.7 },
  });
}
for (const phrase of PACE_WORDS) {
  sweeps.push({
    text: `Khan to Smith, 1 run, ${phrase}, worked away to deep midwicket`,
    runs: 1,
    expect: { deliveryType: "pace", minConfidence: 0.7 },
  });
}

// Length, line and trajectory vocabulary.
for (const group of LENGTH_GROUPS) {
  for (const phrase of group.phrases) {
    sweeps.push({
      text: `Khan to Smith, 1 run, ${phrase}, worked away to deep midwicket`,
      runs: 1,
      expect: { length: group.length, minConfidence: 0.7 },
    });
  }
}
for (const group of LINE_GROUPS) {
  for (const phrase of group.phrases) {
    sweeps.push({
      text: `Khan to Smith, 1 run, ${phrase}, worked away to deep midwicket`,
      runs: 1,
      expect: { line: group.line, minConfidence: 0.7 },
    });
  }
}
for (const group of TRAJECTORY_GROUPS) {
  for (const phrase of group.phrases) {
    sweeps.push({
      text: `Khan to Smith, 1 run, ${phrase}, worked away to deep midwicket`,
      runs: 1,
      expect: { trajectory: group.trajectory, minConfidence: 0.7 },
    });
  }
}

const ALL_CASES: CorpusCase[] = [...CORPUS, ...sweeps];

describe("Shot Synthesizer corpus", () => {
  it(`runs 500+ commentary lines (${ALL_CASES.length} total)`, () => {
    expect(ALL_CASES.length).toBeGreaterThanOrEqual(500);
  });

  it.each(ALL_CASES.map((c, i) => [labelOf(c), c, i] as const))("%s", (_label, c, i) => {
    const shot = synthesizeShot(eventFrom(c, i), c.hand ? { battingHand: c.hand } : {});
    const e = c.expect ?? {};
    if (e.deliveryType) expect(shot.deliveryType).toBe(e.deliveryType);
    if (e.length) expect(shot.length).toBe(e.length);
    if (e.line) expect(shot.line).toBe(e.line);
    if (e.shotType) expect(shot.shotType).toBe(e.shotType);
    if (e.wagonZone) expect(shot.wagonZone).toBe(e.wagonZone);
    if (e.trajectory) expect(shot.trajectory).toBe(e.trajectory);
    if (e.fielderRole) expect(shot.fielderRole).toBe(e.fielderRole);
    if (e.isBoundary !== undefined) expect(shot.isBoundary).toBe(e.isBoundary);
    if (e.runsScored !== undefined) expect(shot.runsScored).toBe(e.runsScored);
    if (e.minConfidence !== undefined) expect(shot.confidence).toBeGreaterThanOrEqual(e.minConfidence);
    if (e.maxConfidence !== undefined) expect(shot.confidence).toBeLessThanOrEqual(e.maxConfidence);
    if (e.minRadius !== undefined) expect(shot.landingRadius).toBeGreaterThanOrEqual(e.minRadius);
    if (e.maxRadius !== undefined) expect(shot.landingRadius).toBeLessThanOrEqual(e.maxRadius);
    // Universal invariants.
    expect(shot.landingRadius).toBeGreaterThanOrEqual(0);
    expect(shot.landingRadius).toBeLessThanOrEqual(1);
    expect(shot.confidence).toBeGreaterThan(0);
    expect(shot.confidence).toBeLessThanOrEqual(1);
  });

  it("CI gate: ≥80% of the corpus parses at confidence ≥0.7 (rules alone)", () => {
    const gated = ALL_CASES.filter((c) => !c.sparse);
    const passing = gated.filter(
      (c, i) => synthesizeShot(eventFrom(c, i), c.hand ? { battingHand: c.hand } : {}).confidence >= 0.7,
    );
    const rate = passing.length / gated.length;
    console.log(
      `[shot-synthesizer] corpus: ${ALL_CASES.length} lines · gated: ${gated.length} · ≥0.7 confidence: ${passing.length} (${(rate * 100).toFixed(1)}%) — target ≥80%`,
    );
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });

  it("CI gate holds on the hand-written corpus alone (no generated padding)", () => {
    const gated = CORPUS.filter((c) => !c.sparse);
    const passing = gated.filter(
      (c, i) => synthesizeShot(eventFrom(c, i), c.hand ? { battingHand: c.hand } : {}).confidence >= 0.7,
    );
    const rate = passing.length / gated.length;
    console.log(
      `[shot-synthesizer] hand-written: ${gated.length} gated lines · ≥0.7: ${passing.length} (${(rate * 100).toFixed(1)}%)`,
    );
    expect(rate).toBeGreaterThanOrEqual(0.8);
  });
});

describe("CLAUDE.md reference deliveries (exact spec'd shapes)", () => {
  it("Rashid → Axar, cut to sweeper cover", () => {
    const shot = synthesizeShot({
      matchId: "ref",
      innings: 2,
      over: 18,
      ball: 4,
      bowlerId: "p-rashid",
      batterId: "p-axar",
      nonStrikerId: "p-kohli",
      runs: { batter: 1, extras: 0, total: 1 },
      commentaryText:
        "Adil Rashid to Axar Patel, 1 run, flatter on off stump, Axar goes on the back foot and cuts to the right of sweeper cover",
      timestamp: "2026-07-03T18:30:00.000Z",
    });
    expect(shot).toMatchObject({
      deliveryType: "spin",
      line: "off",
      shotType: "cut",
      trajectory: "ground",
      fielderRole: "sweeper-cover",
      runsScored: 1,
      isBoundary: false,
    });
    expect(shot.confidence).toBeGreaterThanOrEqual(0.7);
    expect(shot.landingRadius).toBeGreaterThan(0.6); // "~0.75" — sweeper patrols the deep
  });

  it("Rashid → Axar, the googly stumping (advance + miss + stumped scene)", () => {
    const shot = synthesizeShot({
      matchId: "ref",
      innings: 2,
      over: 19,
      ball: 1,
      bowlerId: "p-rashid",
      batterId: "p-axar",
      nonStrikerId: "p-kohli",
      runs: { batter: 0, extras: 0, total: 0 },
      wicket: { kind: "stumped", playerOutId: "p-axar", fielderIds: ["p-buttler"] },
      commentaryText:
        "Adil Rashid to Axar Patel, WICKET! Deceives him with a googly. Axar charges down the track, beaten past the outside edge, and Buttler is lightning quick — whips off the bails. Stumped!",
      timestamp: "2026-07-03T18:31:00.000Z",
    });
    expect(shot).toMatchObject({ deliveryType: "spin", shotType: "missed", isBoundary: false });
    expect(shot.landingRadius).toBeLessThanOrEqual(0.05); // never left the crease
    expect(shot.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("bowling style context resolves delivery type when prose can't", () => {
    const base: BallEvent = {
      matchId: "ref",
      innings: 1,
      over: 4,
      ball: 2,
      bowlerId: "b",
      batterId: "s",
      nonStrikerId: "n",
      runs: { batter: 0, extras: 0, total: 0 },
      commentaryText: "defended back to the bowler",
      timestamp: "2026-07-03T18:32:00.000Z",
    };
    expect(synthesizeShot(base, { bowlingStyle: "Leg-break googly" }).deliveryType).toBe("spin");
    expect(synthesizeShot(base, { bowlingStyle: "Right-arm fast-medium" }).deliveryType).toBe("pace");
  });
});

describe("ambiguity policy — wrong-but-plausible beats flashy-but-absurd", () => {
  const vague: BallEvent = {
    matchId: "vague",
    innings: 1,
    over: 7,
    ball: 3,
    bowlerId: "b",
    batterId: "s",
    nonStrikerId: "n",
    runs: { batter: 0, extras: 0, total: 0 },
    commentaryText: "hmm, interesting delivery there",
    timestamp: "2026-07-03T18:33:00.000Z",
  };

  it("nonsense text → low confidence, conservative dot-ball scene", () => {
    const shot = synthesizeShot(vague);
    expect(shot.confidence).toBeLessThan(0.5);
    expect(shot.shotType).toBe("defend");
    expect(shot.trajectory).toBe("ground");
    expect(shot.landingRadius).toBeLessThanOrEqual(0.15);
    expect(shot.isBoundary).toBe(false);
  });

  it("a dot ball is never synthesized as a spectacular stroke", () => {
    for (const c of CORPUS) {
      if ((c.runs ?? 0) > 0 || c.wicket || c.extras) continue;
      const shot = synthesizeShot(eventFrom(c, 0), c.hand ? { battingHand: c.hand } : {});
      expect(shot.isBoundary).toBe(false);
      expect(shot.landingRadius).toBeLessThan(0.7);
    }
  });

  it("determinism: same event in, same scene out", () => {
    const a = synthesizeShot(vague);
    const b = synthesizeShot(vague);
    expect(a).toEqual(b);
  });
});
