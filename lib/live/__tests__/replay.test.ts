/**
 * Replays the real recorded match (IND v AUS, Women's T20 WC) through the
 * live pipeline and asserts the rebuilt state converges on the known result —
 * the strongest proof that store → delta → header math works end to end.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CricsheetAdapter } from "@/lib/providers/cricsheet.adapter";
import { parseSpeed, ReplaySession, ReplayUnavailableError } from "../replay";
import { MemoryLiveStore } from "../store";
import type { WireMessage } from "../types";

const FIXTURE_DIR = path.resolve(__dirname, "../../providers/__fixtures__/cricsheet");
const MATCH_ID = "1490706";
const NEVER_MS = 10_000_000; // ticks driven manually in tests

function cricsheetSource() {
  const adapter = new CricsheetAdapter({ dir: FIXTURE_DIR });
  return {
    getMatch: (id: string) => adapter.getMatch(id),
    getBallByBall: (id: string) => adapter.getBallByBall(id),
    getFixtures: (date: string) => adapter.getFixtures(date),
  };
}

describe("parseSpeed", () => {
  it("accepts 8x / 8 / garbage / out-of-range", () => {
    expect(parseSpeed("8x")).toBe(8);
    expect(parseSpeed("2")).toBe(2);
    expect(parseSpeed("warp")).toBe(8);
    expect(parseSpeed(null)).toBe(8);
    expect(parseSpeed("9999")).toBe(64);
    expect(parseSpeed("0")).toBe(8);
  });
});

describe("ReplaySession — full match through the pipeline", () => {
  it("rebuilds the known final state ball by ball", async () => {
    const source = cricsheetSource();
    const store = new MemoryLiveStore();
    const session = new ReplaySession(MATCH_ID, 8, store, source, NEVER_MS);

    const messages: WireMessage[] = [];
    store.subscribe(session.key, (m) => messages.push(m));

    await session.attach();
    session.detach(); // pause the (never-firing) timer; drive ticks manually

    const initial = await store.get(session.key);
    expect(initial?.version).toBe(1);
    expect(initial?.header.status).toBe("live");
    expect(initial?.header.innings[0]).toMatchObject({ runs: 0, wickets: 0, legalBalls: 0 });

    const timeline = await source.getBallByBall(MATCH_ID);
    const maxSteps = timeline.length + 10;
    for (let i = 0; i < maxSteps && !session.progress.finished; i++) {
      await session.tick();
    }
    expect(session.progress.finished).toBe(true);

    const balls = messages.filter((m) => m.kind === "ball");
    const statuses = messages.filter((m) => m.kind === "status");
    expect(balls).toHaveLength(timeline.length);
    // one innings break + one completion
    expect(statuses.map((s) => s.header.status)).toEqual(["innings-break", "completed"]);

    const breakMsg = statuses[0]!;
    expect(breakMsg.header.statusText).toBe("Innings break — target 171");

    const final = await store.get(session.key);
    expect(final?.header.status).toBe("completed");
    expect(final?.header.statusText).toBe("Australia won by 6 wickets");
    expect(final?.header.innings[0]).toMatchObject({ runs: 170, wickets: 4, legalBalls: 120, oversText: "20" });
    expect(final?.header.innings[1]).toMatchObject({ runs: 172, wickets: 4, legalBalls: 114, oversText: "19" });

    // §8 budget: every per-ball SSE payload under 2 KB
    for (const ball of balls) {
      expect(JSON.stringify(ball).length).toBeLessThan(2048);
    }

    // chase sentences appear once the second innings is underway
    const midChase = balls.find((m) => m.kind === "ball" && m.events[0]?.innings === 2 && m.header.statusText.includes("need"));
    expect(midChase?.header.statusText).toMatch(/Australia need \d+ off \d+ balls?/);
  });

  it("rejects matches with no ball-by-ball data", async () => {
    const source = {
      ...cricsheetSource(),
      getBallByBall: async () => [],
      getMatch: () => cricsheetSource().getMatch(MATCH_ID),
    };
    const session = new ReplaySession(MATCH_ID, 8, new MemoryLiveStore(), source, NEVER_MS);
    await expect(session.attach()).rejects.toThrow(ReplayUnavailableError);
  });
});
