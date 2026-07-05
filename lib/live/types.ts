/**
 * Live pipeline wire + state types (Phase 2, CLAUDE.md §3.2).
 *
 * Wire protocol (SSE):
 *  - `snapshot` — full state, sent ONCE per connection (and on reconnect).
 *  - `ball`     — delta with the new BallEvent(s) + refreshed header. Budget:
 *                 < 2 KB per ball (§8) — the header is a slim summary, never
 *                 the full MatchDetail.
 *  - `status`   — header-only change (innings break, completion), no events.
 *
 * Versions are monotonic per stream; clients ignore stale versions and force a
 * reconnect (which replays the snapshot) if they ever see a gap.
 */
import type { BallEvent, BallRef, InningsSummary, MatchDetail, MatchStatus } from "@/lib/providers/types";

/** The compact live header — everything the UI needs per ball, ~300-500 B. */
export interface LiveHeader {
  status: MatchStatus;
  statusText: string;
  innings: InningsSummary[];
  battingTeamId?: string;
  lastBall?: BallRef;
}

export interface WireSnapshot {
  kind: "snapshot";
  matchId: string;
  version: number;
  detail: MatchDetail;
  header: LiveHeader;
  events: BallEvent[];
  updatedAt: string;
}

export interface WireDelta {
  kind: "ball";
  matchId: string;
  version: number;
  header: LiveHeader;
  events: BallEvent[];
  updatedAt: string;
}

export interface WireStatus {
  kind: "status";
  matchId: string;
  version: number;
  header: LiveHeader;
  updatedAt: string;
}

export type WireMessage = WireSnapshot | WireDelta | WireStatus;

/** Events are version-tagged in the store so pollers can diff without seq ids. */
export interface StoredEvent {
  v: number;
  event: BallEvent;
}

export interface LiveState {
  matchId: string;
  version: number;
  detail: MatchDetail;
  header: LiveHeader;
  events: StoredEvent[];
  /** Provider events ever consumed — the diff anchor. Survives window trimming. */
  seen: number;
  updatedAt: string;
}

/** Stored history cap per match (a full T20 is ~260 deliveries). */
export const EVENT_CAP = 400;
/** Events included in a connection snapshot — enough feed to scroll, light to send. */
export const SNAPSHOT_EVENT_CAP = 120;

export function toWireSnapshot(state: LiveState): WireSnapshot {
  return {
    kind: "snapshot",
    matchId: state.matchId,
    version: state.version,
    detail: {
      ...state.detail,
      status: state.header.status,
      statusText: state.header.statusText,
      innings: state.header.innings,
      ...(state.header.lastBall ? { lastBall: state.header.lastBall } : {}),
      ...(state.header.battingTeamId ? { battingTeamId: state.header.battingTeamId } : {}),
    },
    header: state.header,
    events: state.events.slice(-SNAPSHOT_EVENT_CAP).map((e) => e.event),
    updatedAt: state.updatedAt,
  };
}
