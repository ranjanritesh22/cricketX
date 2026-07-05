import { describe, expect, it } from "vitest";
import type { BallEvent, MatchDetail } from "@/lib/providers/types";
import { ensureSnapshot, pollIntervalMs, syncMatch } from "../poller";
import { MemoryLiveStore } from "../store";
import { testBall, testDetail } from "./helpers";

/** A provider that grows its feed between polls — the live-match shape. */
class FakeSource {
  detail: MatchDetail = testDetail({ statusText: "Alphas batting" });
  events: BallEvent[] = [testBall(1, 0, 1, 1), testBall(1, 0, 2, 4)];
  async getMatch() {
    return this.detail;
  }
  async getBallByBall() {
    return [...this.events];
  }
  async getFixtures() {
    return [];
  }
}

describe("poller", () => {
  it("maps status to the adaptive cadence", () => {
    expect(pollIntervalMs("live")).toBe(4_000);
    expect(pollIntervalMs("innings-break")).toBe(60_000);
    expect(pollIntervalMs("upcoming")).toBe(300_000);
    expect(pollIntervalMs("completed")).toBe(0);
  });

  it("creates the initial snapshot without publishing", async () => {
    const store = new MemoryLiveStore();
    const source = new FakeSource();
    const published: unknown[] = [];
    store.subscribe("m-test", (m) => published.push(m));

    const result = await syncMatch("m-test", store, source);
    expect(result.state.version).toBe(1);
    expect(result.state.seen).toBe(2);
    expect(result.published).toBeNull();
    expect(published).toHaveLength(0);
    expect((await store.get("m-test"))?.events).toHaveLength(2);
  });

  it("publishes only the new balls on subsequent polls, under the 2 KB budget", async () => {
    const store = new MemoryLiveStore();
    const source = new FakeSource();
    await syncMatch("m-test", store, source);

    source.events.push(testBall(1, 0, 3, 6));
    source.detail = testDetail({ statusText: "Alphas motoring" });
    const result = await syncMatch("m-test", store, source);

    expect(result.published?.kind).toBe("ball");
    expect(result.newEvents).toBe(1);
    expect(result.state.version).toBe(2);
    expect(result.state.seen).toBe(3);
    if (result.published?.kind === "ball") {
      expect(result.published.events).toHaveLength(1);
      expect(result.published.events[0]?.runs.total).toBe(6);
      expect(JSON.stringify(result.published).length).toBeLessThan(2048);
    }
  });

  it("is a no-op when nothing changed", async () => {
    const store = new MemoryLiveStore();
    const source = new FakeSource();
    await syncMatch("m-test", store, source);
    const result = await syncMatch("m-test", store, source);
    expect(result.published).toBeNull();
    expect(result.newEvents).toBe(0);
    expect(result.state.version).toBe(1);
  });

  it("publishes a header-only status message when the score context changes", async () => {
    const store = new MemoryLiveStore();
    const source = new FakeSource();
    await syncMatch("m-test", store, source);
    source.detail = testDetail({ status: "innings-break", statusText: "Innings break" });
    const result = await syncMatch("m-test", store, source);
    expect(result.published?.kind).toBe("status");
    expect(result.state.header.status).toBe("innings-break");
    expect(result.nextPollMs).toBe(60_000);
  });

  it("treats a shrunken provider feed as a reset, not as new balls", async () => {
    const store = new MemoryLiveStore();
    const source = new FakeSource();
    await syncMatch("m-test", store, source);
    source.events = [];
    const result = await syncMatch("m-test", store, source);
    expect(result.newEvents).toBe(0);
    expect(result.state.seen).toBe(2);
  });

  it("ensureSnapshot is create-if-missing", async () => {
    const store = new MemoryLiveStore();
    const source = new FakeSource();
    const first = await ensureSnapshot("m-test", store, source);
    source.events.push(testBall(1, 0, 3, 1));
    const second = await ensureSnapshot("m-test", store, source);
    expect(second.version).toBe(first.version); // no re-sync when present
  });
});
