/**
 * The poller — normalize → diff → store → publish (CLAUDE.md §3.2).
 *
 * One `syncMatch` call = ONE provider poll for that match, regardless of how
 * many clients are watching. Diffing is count-based (slice past what we've
 * stored) rather than sinceBall-based: wides share a ball number with the
 * re-bowled delivery, so tuple filtering can drop a legal ball — provider
 * sequence ids make this cleaner when a provider that has them (EntitySport)
 * lands.
 */
import type { MatchStatus } from "@/lib/providers/types";
import { enrichEvents } from "@/lib/synth/stage2";
import { headerFromDetail } from "./header";
import type { LiveSource } from "./source";
import type { LiveStore } from "./store";
import { EVENT_CAP, type LiveState, type StoredEvent, type WireMessage } from "./types";

/** Adaptive poll cadence (CLAUDE.md §3.2): live 4s, break 60s, pre-match 5min. */
export function pollIntervalMs(status: MatchStatus): number {
  switch (status) {
    case "live":
      return 4_000;
    case "innings-break":
    case "stumps":
      return 60_000;
    case "upcoming":
      return 300_000;
    default:
      return 0; // completed/abandoned — stop polling
  }
}

export interface SyncResult {
  state: LiveState;
  published: WireMessage | null;
  newEvents: number;
  nextPollMs: number;
  done: boolean;
}

export async function syncMatch(matchId: string, store: LiveStore, source: LiveSource): Promise<SyncResult> {
  const detail = await source.getMatch(matchId);
  const header = headerFromDetail(detail);
  const existing = await store.get(matchId);
  const nextPollMs = pollIntervalMs(detail.status);
  const done = nextPollMs === 0;

  if (!existing) {
    const all = await source.getBallByBall(matchId).catch(() => []);
    const state: LiveState = {
      matchId,
      version: 1,
      detail,
      header,
      events: all.slice(-EVENT_CAP).map((event) => ({ v: 1, event })),
      seen: all.length,
      updatedAt: new Date().toISOString(),
    };
    await store.set(state);
    return { state, published: null, newEvents: all.length, nextPollMs, done };
  }

  const all = await source.getBallByBall(matchId).catch(() => []);
  // Feeds are append-only; a shorter list than `seen` means a provider reset —
  // treat as no new balls rather than replaying the tail as fresh.
  // Fresh deltas (never the history backfill) get the Stage-2 LLM fallback
  // attached server-side when Stage 1 is unsure — feature-flagged, cached,
  // and a no-op without ANTHROPIC_API_KEY (CLAUDE.md §4).
  const fresh = await enrichEvents(all.length >= existing.seen ? all.slice(existing.seen) : []);
  const headerChanged = JSON.stringify(header) !== JSON.stringify(existing.header);

  if (fresh.length === 0 && !headerChanged) {
    return { state: existing, published: null, newEvents: 0, nextPollMs, done };
  }

  const version = existing.version + 1;
  const stored: StoredEvent[] = [...existing.events, ...fresh.map((event) => ({ v: version, event }))].slice(-EVENT_CAP);
  const state: LiveState = {
    matchId,
    version,
    detail,
    header,
    events: stored,
    seen: existing.seen + fresh.length,
    updatedAt: new Date().toISOString(),
  };
  await store.set(state);

  const published: WireMessage =
    fresh.length > 0
      ? { kind: "ball", matchId, version, header, events: fresh, updatedAt: state.updatedAt }
      : { kind: "status", matchId, version, header, updatedAt: state.updatedAt };
  await store.publish(matchId, published);

  return { state, published, newEvents: fresh.length, nextPollMs, done };
}

/** Create-if-missing used by the SSE route before sending the first snapshot. */
export async function ensureSnapshot(matchId: string, store: LiveStore, source: LiveSource): Promise<LiveState> {
  const existing = await store.get(matchId);
  if (existing) return existing;
  const { state } = await syncMatch(matchId, store, source);
  return state;
}
