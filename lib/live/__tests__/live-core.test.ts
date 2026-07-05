import { beforeEach, describe, expect, it } from "vitest";
import { applyEventToInnings, buildHeader, inningsTeamResolver } from "../header";
import { acquireStream, resetRateLimiter } from "../rate-limit";
import { MemoryLiveStore } from "../store";
import type { WireDelta } from "../types";
import { testBall, testDetail } from "./helpers";

describe("header math", () => {
  const detail = testDetail();
  const teamFor = inningsTeamResolver(detail);

  it("accumulates runs, wickets and legal balls (wides/noballs excluded)", () => {
    let innings = applyEventToInnings([], testBall(1, 0, 1, 4), teamFor);
    innings = applyEventToInnings(innings, testBall(1, 0, 2, 1, { wide: true }), teamFor);
    innings = applyEventToInnings(innings, testBall(1, 0, 2, 0, { wicket: true }), teamFor);
    expect(innings).toHaveLength(1);
    expect(innings[0]).toMatchObject({ runs: 5, wickets: 1, legalBalls: 2, oversText: "0.2", battingTeamId: "t-a" });
  });

  it("opens later innings lazily with alternating teams", () => {
    const innings = applyEventToInnings([], testBall(2, 0, 1, 6), teamFor);
    expect(innings).toHaveLength(2);
    expect(innings[0]).toMatchObject({ battingTeamId: "t-a", runs: 0 });
    expect(innings[1]).toMatchObject({ battingTeamId: "t-b", runs: 6, legalBalls: 1 });
  });

  it("builds chase statusText in the second innings", () => {
    let innings = applyEventToInnings([], testBall(1, 0, 1, 4), teamFor);
    innings = innings.map((i) => ({ ...i, runs: 150, legalBalls: 120, oversText: "20" }));
    innings = applyEventToInnings(innings, testBall(2, 0, 1, 4), teamFor);
    const header = buildHeader(detail, innings, testBall(2, 0, 1, 4), "live");
    expect(header.status).toBe("live");
    expect(header.statusText).toBe("Bravos need 147 off 119 balls");
    expect(header.lastBall).toEqual({ innings: 2, over: 0, ball: 1 });
  });

  it("labels innings breaks with the target and completion with the result", () => {
    const innings = [{ number: 1, battingTeamId: "t-a", runs: 170, wickets: 4, oversText: "20", legalBalls: 120 }];
    expect(buildHeader(detail, innings, null, "innings-break").statusText).toBe("Innings break — target 171");
    const done = buildHeader(detail, innings, null, "completed");
    expect(done.status).toBe("completed");
    expect(done.statusText).toBe("Alphas won by 10 runs");
  });
});

describe("MemoryLiveStore", () => {
  it("round-trips state and fans out published messages", async () => {
    const store = new MemoryLiveStore();
    const seen: number[] = [];
    const unsubscribe = store.subscribe("m", (msg) => seen.push(msg.version));
    const other: number[] = [];
    store.subscribe("m", (msg) => other.push(msg.version));

    const delta: WireDelta = {
      kind: "ball",
      matchId: "m",
      version: 2,
      header: buildHeader(testDetail(), [], null, "live"),
      events: [testBall(1, 0, 1, 1)],
      updatedAt: new Date().toISOString(),
    };
    await store.publish("m", delta);
    expect(seen).toEqual([2]);
    expect(other).toEqual([2]);

    unsubscribe();
    await store.publish("m", { ...delta, version: 3 });
    expect(seen).toEqual([2]);
    expect(other).toEqual([2, 3]);
  });
});

describe("SSE rate limiter", () => {
  beforeEach(() => resetRateLimiter());

  it("caps concurrent streams per IP and frees on release", () => {
    const permits = Array.from({ length: 6 }, () => acquireStream("1.2.3.4"));
    expect(permits.every((p) => p.ok)).toBe(true);
    expect(acquireStream("1.2.3.4").ok).toBe(false);
    expect(acquireStream("5.6.7.8").ok).toBe(true); // other IPs unaffected
    permits[0]?.release();
    permits[0]?.release(); // idempotent
    expect(acquireStream("1.2.3.4").ok).toBe(true);
  });

  it("caps connection attempts per minute", () => {
    for (let i = 0; i < 30; i++) {
      const p = acquireStream("9.9.9.9");
      expect(p.ok).toBe(true);
      p.release();
    }
    expect(acquireStream("9.9.9.9").ok).toBe(false);
  });
});
