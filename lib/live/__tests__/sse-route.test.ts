/**
 * Integration test of the SSE endpoint: real Request in, real event-stream
 * out — snapshot-first protocol, fan-out of published deltas, replay
 * sessions, 404s, and rate limiting.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/live/[matchId]/route";
import { resetRateLimiter } from "../rate-limit";
import { resetReplaySessions } from "../replay";
import { getLiveStore, getReplayStore, MemoryLiveStore } from "../store";
import { resetTickers } from "../ticker";
import type { WireDelta } from "../types";

const LIVE_ID = "eng-in-ind-2026-t20i-3"; // the mock universe's live match
process.env.CRICSHEET_DIR = "lib/providers/__fixtures__/cricsheet";

interface SseEvent {
  event: string;
  data: string;
}

/** Minimal SSE reader over a Response body. */
class SseReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(res: Response) {
    if (!res.body) throw new Error("response has no body");
    this.reader = res.body.getReader();
  }

  async next(timeoutMs: number): Promise<SseEvent> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const blockEnd = this.buffer.indexOf("\n\n");
      if (blockEnd >= 0) {
        const block = this.buffer.slice(0, blockEnd);
        this.buffer = this.buffer.slice(blockEnd + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (event && data !== undefined) return { event, data };
        continue; // retry hint / ping comment — skip
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("timed out waiting for SSE event");
      const chunk = await Promise.race([
        this.reader.read(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out reading stream")), remaining)),
      ]);
      if (chunk.done) throw new Error("stream ended");
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
    }
  }
}

function request(path: string, signal: AbortSignal): Request {
  return new Request(`http://test.local${path}`, { signal });
}

function params(matchId: string) {
  return { params: Promise.resolve({ matchId }) };
}

beforeEach(() => {
  resetRateLimiter();
});

afterEach(() => {
  resetTickers();
  resetReplaySessions();
  const live = getLiveStore();
  if (live instanceof MemoryLiveStore) live.clear();
  getReplayStore().clear();
});

describe("GET /api/live/[matchId]", () => {
  it("sends the snapshot first, then fans out published deltas", async () => {
    const ac = new AbortController();
    try {
      const res = await GET(request(`/api/live/${LIVE_ID}`, ac.signal), params(LIVE_ID));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const reader = new SseReader(res);
      const first = await reader.next(3000);
      expect(first.event).toBe("snapshot");
      const snapshot = JSON.parse(first.data);
      expect(snapshot.header.statusText).toBe("England need 98 off 52 balls");
      expect(snapshot.events.length).toBeGreaterThan(0);
      expect(snapshot.detail.teams.home.shortName).toBe("IND");

      const delta: WireDelta = {
        kind: "ball",
        matchId: LIVE_ID,
        version: snapshot.version + 1,
        header: snapshot.header,
        events: [snapshot.events[0]],
        updatedAt: new Date().toISOString(),
      };
      await getLiveStore().publish(LIVE_ID, delta);

      const second = await reader.next(3000);
      expect(second.event).toBe("ball");
      expect(JSON.parse(second.data).version).toBe(snapshot.version + 1);
    } finally {
      ac.abort();
    }
  });

  it("404s unknown matches", async () => {
    const ac = new AbortController();
    const res = await GET(request("/api/live/no-such-match", ac.signal), params("no-such-match"));
    expect(res.status).toBe(404);
    ac.abort();
  });

  it("streams a replay session from ball zero", async () => {
    const ac = new AbortController();
    try {
      const res = await GET(
        request("/api/live/1490706?replay=1490706&speed=64", ac.signal),
        params("1490706"),
      );
      expect(res.status).toBe(200);

      const reader = new SseReader(res);
      const first = await reader.next(5000);
      expect(first.event).toBe("snapshot");
      const snapshot = JSON.parse(first.data);
      expect(snapshot.header.status).toBe("live");
      expect(snapshot.header.innings[0]).toMatchObject({ runs: 0, wickets: 0 });

      // 64x → one ball every 625ms; the first delta should land well inside 5s
      const second = await reader.next(5000);
      expect(second.event).toBe("ball");
      const delta = JSON.parse(second.data);
      expect(delta.events).toHaveLength(1);
      expect(JSON.stringify(delta).length).toBeLessThan(2048);
    } finally {
      ac.abort();
    }
  });

  it("rate-limits burst connections per IP", async () => {
    const controllers: AbortController[] = [];
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 8; i++) {
        const ac = new AbortController();
        controllers.push(ac);
        const res = await GET(
          new Request(`http://test.local/api/live/${LIVE_ID}`, {
            signal: ac.signal,
            headers: { "x-forwarded-for": "203.0.113.7" },
          }),
          params(LIVE_ID),
        );
        statuses.push(res.status);
      }
      expect(statuses.filter((s) => s === 200)).toHaveLength(6);
      expect(statuses.filter((s) => s === 429)).toHaveLength(2);
    } finally {
      controllers.forEach((c) => c.abort());
    }
  });
});
