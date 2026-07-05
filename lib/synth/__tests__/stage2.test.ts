/**
 * Stage-2 LLM fallback (Phase 5) — provably optional (disabled = untouched
 * events), provably cached (identical text never calls twice), and hardened
 * against garbage LLM output. No test touches the network: the caller is
 * injected.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BallEvent } from "@/lib/providers/types";
import { synthesizeShot } from "@/lib/synth";
import {
  commentaryHash,
  enrichEvents,
  isStage2Enabled,
  reconcileShot,
  resetStage2Cache,
  STAGE2_THRESHOLD,
} from "@/lib/synth/stage2";

const testEnv = (vars: Record<string, string>): NodeJS.ProcessEnv =>
  ({ NODE_ENV: "test", ...vars }) as NodeJS.ProcessEnv;

const ENABLED_ENV = testEnv({ ANTHROPIC_API_KEY: "sk-test" });

function ball(commentaryText: string, batterRuns = 0, over = 4, ballNo = 1): BallEvent {
  return {
    matchId: "m1",
    innings: 1,
    over,
    ball: ballNo,
    bowlerId: "b1",
    batterId: "s1",
    nonStrikerId: "s2",
    runs: { batter: batterRuns, extras: 0, total: batterRuns },
    commentaryText,
    timestamp: new Date().toISOString(),
  };
}

/** A vague line Stage 1 genuinely can't read. */
const VAGUE = "hmm, that went somewhere interesting off the blade";

const GOOD_LLM_SHOT = {
  deliveryType: "pace",
  length: "good",
  line: "off",
  shotType: "drive",
  wagonZone: 6,
  trajectory: "ground",
  landingRadius: 0.4,
  fielderRole: null,
  confidence: 0.7,
};

beforeEach(() => resetStage2Cache());

describe("flag", () => {
  it("is off without a key and can be forced off with SYNTH_LLM=0", () => {
    expect(isStage2Enabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isStage2Enabled(ENABLED_ENV)).toBe(true);
    expect(isStage2Enabled(testEnv({ ANTHROPIC_API_KEY: "x", SYNTH_LLM: "0" }))).toBe(false);
  });

  it("never calls the LLM when disabled — app fully functional on Stage 1", async () => {
    const call = vi.fn();
    const events = [ball(VAGUE)];
    const out = await enrichEvents(events, { call, env: {} as NodeJS.ProcessEnv });
    expect(call).not.toHaveBeenCalled();
    expect(out).toEqual(events);
  });
});

describe("enrichment", () => {
  it("targets only balls under the confidence threshold", async () => {
    const rich = ball("Bumrah to Buttler, FOUR, short and wide, cut hard past backward point and it races away", 4);
    expect(synthesizeShot(rich).confidence).toBeGreaterThanOrEqual(STAGE2_THRESHOLD);
    const vague = ball(VAGUE, 1);
    expect(synthesizeShot(vague).confidence).toBeLessThan(STAGE2_THRESHOLD);

    const call = vi.fn().mockResolvedValue(GOOD_LLM_SHOT);
    const out = await enrichEvents([rich, vague], { call, env: ENABLED_ENV });
    expect(call).toHaveBeenCalledTimes(1);
    expect(out[0]!.synth).toBeUndefined(); // confident ball untouched — client derives
    expect(out[1]!.synth).toBeDefined();
    expect(out[1]!.synth!.shotType).toBe("drive");
    expect(out[1]!.synth!.confidence).toBeGreaterThanOrEqual(STAGE2_THRESHOLD);
  });

  it("caches by commentary hash — identical text never calls twice", async () => {
    const call = vi.fn().mockResolvedValue(GOOD_LLM_SHOT);
    await enrichEvents([ball(VAGUE, 1, 4, 1)], { call, env: ENABLED_ENV });
    const second = await enrichEvents([ball(VAGUE, 1, 7, 3)], { call, env: ENABLED_ENV });
    expect(call).toHaveBeenCalledTimes(1); // cache hit
    expect(second[0]!.synth).toBeDefined();
    expect(commentaryHash(VAGUE)).toBe(commentaryHash(`  ${VAGUE.toUpperCase()}  `.toLowerCase()));
  });

  it("caches failures too, and leaves the event untouched", async () => {
    const call = vi.fn().mockRejectedValue(new Error("boom"));
    const out = await enrichEvents([ball(VAGUE)], { call, env: ENABLED_ENV });
    expect(out[0]!.synth).toBeUndefined();
    await enrichEvents([ball(VAGUE)], { call, env: ENABLED_ENV });
    expect(call).toHaveBeenCalledTimes(1); // failure cached, no retry storm
  });

  it("rejects schema-invalid LLM output", async () => {
    const call = vi.fn().mockResolvedValue({ shotType: "moonball", wagonZone: 14 });
    const out = await enrichEvents([ball(VAGUE)], { call, env: ENABLED_ENV });
    expect(out[0]!.synth).toBeUndefined();
  });

  it("keeps the enriched delta under the 2 KB SSE budget", async () => {
    const call = vi.fn().mockResolvedValue(GOOD_LLM_SHOT);
    const [enriched] = await enrichEvents([ball(VAGUE, 1)], { call, env: ENABLED_ENV });
    expect(JSON.stringify(enriched).length).toBeLessThan(2048 - 600); // header headroom
  });
});

describe("reconcileShot", () => {
  it("overrides outcome facts with what the event proves", () => {
    const six = ball("something unclear", 6);
    const shot = reconcileShot({ ...GOOD_LLM_SHOT, trajectory: "ground", landingRadius: 0.3 }, six)!;
    expect(shot.isBoundary).toBe(true);
    expect(shot.runsScored).toBe(6);
    expect(shot.trajectory).toBe("lofted"); // a six is never along the ground
    expect(shot.landingRadius).toBe(1);
  });

  it("clamps confidence into the actionable band", () => {
    const shot = reconcileShot({ ...GOOD_LLM_SHOT, confidence: 7 }, ball(VAGUE, 1))!;
    expect(shot.confidence).toBeLessThanOrEqual(0.9);
    const low = reconcileShot({ ...GOOD_LLM_SHOT, confidence: 0.01 }, ball(VAGUE, 1))!;
    expect(low.confidence).toBeGreaterThan(STAGE2_THRESHOLD);
  });

  it("returns null for garbage", () => {
    expect(reconcileShot(null, ball(VAGUE))).toBeNull();
    expect(reconcileShot("four!", ball(VAGUE))).toBeNull();
    expect(reconcileShot({ ...GOOD_LLM_SHOT, wagonZone: 0 }, ball(VAGUE))).toBeNull();
  });
});
