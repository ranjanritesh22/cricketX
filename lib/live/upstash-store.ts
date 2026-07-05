/**
 * Upstash Redis (REST) implementation of LiveStore.
 *
 * Snapshot lives at `match:{id}:state` as JSON. Upstash REST cannot hold a
 * SUBSCRIBE connection, so `subscribe` polls the stored version every 2s and
 * synthesizes deltas from the version-tagged event log inside the snapshot —
 * every SSE instance sees new balls within one poll tick while the provider
 * is still only polled once (by /api/sync or a worker).
 *
 * NOTE: exercised against a real Upstash instance only when the env keys are
 * present — the automated suite covers the memory store; treat this class as
 * deploy-time verified.
 */
import type { LiveStore } from "./store";
import type { LiveState, WireDelta, WireStatus } from "./types";

const POLL_MS = 2_000;
const STATE_TTL_SECONDS = 6 * 60 * 60;

export class UpstashLiveStore implements LiveStore {
  readonly kind = "upstash" as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private key(streamId: string): string {
    return `match:${streamId}:state`;
  }

  private async command<T>(cmd: (string | number)[]): Promise<T | null> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[live:upstash] ${cmd[0]} failed: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { result?: T };
    return body.result ?? null;
  }

  async get(streamId: string): Promise<LiveState | null> {
    const raw = await this.command<string>(["GET", this.key(streamId)]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LiveState;
    } catch {
      return null;
    }
  }

  async set(state: LiveState): Promise<void> {
    await this.command(["SET", this.key(state.matchId), JSON.stringify(state), "EX", STATE_TTL_SECONDS]);
  }

  /** No cross-instance push channel over REST — delivery happens via the
   *  version poll in `subscribe`, so publish is a deliberate no-op. */
  async publish(_streamId: string, _message: WireDelta | WireStatus): Promise<void> {}

  subscribe(streamId: string, listener: (message: WireDelta | WireStatus) => void): () => void {
    let lastVersion = -1;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      const state = await this.get(streamId);
      if (state && lastVersion >= 0 && state.version > lastVersion) {
        const freshEvents = state.events.filter((e) => e.v > lastVersion).map((e) => e.event);
        listener(
          freshEvents.length > 0
            ? {
                kind: "ball",
                matchId: state.matchId,
                version: state.version,
                header: state.header,
                events: freshEvents,
                updatedAt: state.updatedAt,
              }
            : {
                kind: "status",
                matchId: state.matchId,
                version: state.version,
                header: state.header,
                updatedAt: state.updatedAt,
              },
        );
      }
      if (state) lastVersion = state.version;
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
}
