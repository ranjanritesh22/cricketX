/**
 * Live state store — snapshot + fan-out per match (CLAUDE.md §3.2).
 *
 * DEPLOYMENT TRADEOFF (documented per CLAUDE.md §3.2):
 *  - `memory` (default, zero config): state and pub/sub live in-process. The
 *    SSE route runs a per-match ticker that polls the provider ONCE and fans
 *    out to every connected client. Correct for `next start` on a single
 *    instance (dev, Railway/Fly single node). Vercel's serverless functions
 *    have execution limits and no shared memory — don't ship memory mode there.
 *  - `upstash` (auto-selected when UPSTASH_REDIS_REST_URL/TOKEN are set):
 *    snapshots persist in Redis (`match:{id}:state`); an external writer —
 *    Vercel Cron / QStash hitting /api/sync, or a small always-on worker —
 *    does the polling, and each SSE instance delivers deltas by watching the
 *    snapshot version (Upstash REST has no long-lived SUBSCRIBE, so "pub/sub"
 *    is a 2s version poll; still one provider poll per match, server-side).
 */
import type { LiveState, WireDelta, WireStatus } from "./types";
import { UpstashLiveStore } from "./upstash-store";

export type LiveStoreKind = "memory" | "upstash";

export interface LiveStore {
  readonly kind: LiveStoreKind;
  get(streamId: string): Promise<LiveState | null>;
  set(state: LiveState): Promise<void>;
  /** Deliver a delta to everything subscribed to this stream (this instance or, for upstash, every poller). */
  publish(streamId: string, message: WireDelta | WireStatus): Promise<void>;
  /** Returns an unsubscribe function. Listener receives deltas published after subscription. */
  subscribe(streamId: string, listener: (message: WireDelta | WireStatus) => void): () => void;
}

export class MemoryLiveStore implements LiveStore {
  readonly kind = "memory" as const;
  private states = new Map<string, LiveState>();
  private listeners = new Map<string, Set<(m: WireDelta | WireStatus) => void>>();

  async get(streamId: string): Promise<LiveState | null> {
    return this.states.get(streamId) ?? null;
  }

  async set(state: LiveState): Promise<void> {
    this.states.set(state.matchId, state);
  }

  async publish(streamId: string, message: WireDelta | WireStatus): Promise<void> {
    for (const listener of this.listeners.get(streamId) ?? []) {
      try {
        listener(message);
      } catch {
        // one broken client must not break fan-out to the rest
      }
    }
  }

  subscribe(streamId: string, listener: (message: WireDelta | WireStatus) => void): () => void {
    let set = this.listeners.get(streamId);
    if (!set) {
      set = new Set();
      this.listeners.set(streamId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(streamId);
    };
  }

  /** Test hook. */
  clear() {
    this.states.clear();
    this.listeners.clear();
  }
}

const globalStore = globalThis as unknown as {
  __stadiumxLiveStore?: LiveStore;
  __stadiumxReplayStore?: MemoryLiveStore;
};

export function getLiveStore(): LiveStore {
  if (!globalStore.__stadiumxLiveStore) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    globalStore.__stadiumxLiveStore =
      url && token ? new UpstashLiveStore(url, token) : new MemoryLiveStore();
  }
  return globalStore.__stadiumxLiveStore;
}

/** Replay sessions are inherently single-instance (a local ticker drives them),
 *  so they always live in a dedicated memory store regardless of deployment. */
export function getReplayStore(): MemoryLiveStore {
  globalStore.__stadiumxReplayStore ??= new MemoryLiveStore();
  return globalStore.__stadiumxReplayStore;
}
