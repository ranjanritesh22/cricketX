"use client";

/**
 * Client half of the live pipeline: one EventSource + one zustand store per
 * stream, shared by every consumer (the feed now, the 3D engine in Phase 4 —
 * CLAUDE.md §3.2 "UI + 3D engine consume the same event stream").
 *
 * Recovery model: EventSource auto-reconnects and the server re-sends a full
 * snapshot on every connection, so missed deltas heal themselves. If a
 * version gap sneaks through while connected, we force a reconnect.
 */
import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { LiveHeader, WireDelta, WireSnapshot, WireStatus } from "@/lib/live/types";
import type { BallEvent, MatchDetail } from "@/lib/providers/types";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "ended";

export interface LiveMatchState {
  connection: ConnectionState;
  version: number;
  /** Version carried by the last snapshot — events newer than this arrived
   *  live over deltas and are the only ones that animate in. */
  snapshotVersion: number;
  detail: MatchDetail | null;
  header: LiveHeader | null;
  events: BallEvent[];
}

const CLIENT_EVENT_CAP = 400;
const RETRY_MS = 3_000;

function fromSnapshot(snap: WireSnapshot): Omit<LiveMatchState, "connection" | "snapshotVersion"> {
  return { version: snap.version, detail: snap.detail, header: snap.header, events: snap.events };
}

function isEnded(header: LiveHeader): boolean {
  return header.status === "completed" || header.status === "abandoned" || header.status === "no-result";
}

interface Entry {
  store: StoreApi<LiveMatchState>;
  refs: number;
  es: EventSource | null;
  retryTimer: number | null;
}

const registry = new Map<string, Entry>();

function connect(url: string, entry: Entry) {
  entry.es?.close();
  if (entry.retryTimer !== null) {
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  }
  const es = new EventSource(url);
  entry.es = es;

  const finish = () => {
    entry.store.setState({ connection: "ended" });
    es.close();
  };

  es.addEventListener("snapshot", (e) => {
    const snap = JSON.parse((e as MessageEvent<string>).data) as WireSnapshot;
    entry.store.setState({
      ...fromSnapshot(snap),
      snapshotVersion: snap.version,
      connection: isEnded(snap.header) ? "ended" : "live",
    });
    if (isEnded(snap.header)) es.close();
  });

  const applyDelta = (e: Event) => {
    const msg = JSON.parse((e as MessageEvent<string>).data) as WireDelta | WireStatus;
    const current = entry.store.getState();
    if (msg.version <= current.version) return;
    if (current.version >= 0 && msg.version > current.version + 1) {
      entry.store.setState({ connection: "reconnecting" });
      connect(url, entry); // fresh snapshot closes the gap
      return;
    }
    const events =
      msg.kind === "ball" ? [...current.events, ...msg.events].slice(-CLIENT_EVENT_CAP) : current.events;
    entry.store.setState({
      version: msg.version,
      header: msg.header,
      events,
      connection: isEnded(msg.header) ? "ended" : "live",
    });
    if (isEnded(msg.header)) finish();
  };
  es.addEventListener("ball", applyDelta);
  es.addEventListener("status", applyDelta);
  es.addEventListener("stream-error", () => finish());

  es.onerror = () => {
    const state = entry.store.getState();
    if (state.connection === "ended") {
      es.close();
      return;
    }
    entry.store.setState({ connection: "reconnecting" });
    // While CONNECTING the browser retries on its own; only a hard CLOSED
    // needs a manual re-dial.
    if (es.readyState === EventSource.CLOSED && entry.refs > 0) {
      entry.retryTimer = window.setTimeout(() => connect(url, entry), RETRY_MS);
    }
  };
}

export function useLiveMatch(streamPath: string, initial?: WireSnapshot | null): LiveMatchState {
  const store = useMemo(() => {
    let entry = registry.get(streamPath);
    if (!entry) {
      entry = {
        store: createStore<LiveMatchState>(() =>
          initial
            ? { ...fromSnapshot(initial), snapshotVersion: initial.version, connection: "connecting" }
            : { connection: "connecting", version: -1, snapshotVersion: -1, detail: null, header: null, events: [] },
        ),
        refs: 0,
        es: null,
        retryTimer: null,
      };
      registry.set(streamPath, entry);
    }
    return entry.store;
    // `initial` only seeds the very first mount of a stream — later mounts share state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPath]);

  useEffect(() => {
    // StrictMode unmount/remount can race the registry cleanup — re-register
    // with the memoized store (state survives the double-mount) if needed.
    let entry = registry.get(streamPath);
    if (!entry) {
      entry = { store, refs: 0, es: null, retryTimer: null };
      registry.set(streamPath, entry);
    }
    entry.refs += 1;
    if (!entry.es) connect(streamPath, entry);
    return () => {
      entry.refs -= 1;
      if (entry.refs <= 0) {
        entry.es?.close();
        entry.es = null;
        if (entry.retryTimer !== null) clearTimeout(entry.retryTimer);
        registry.delete(streamPath);
      }
    };
  }, [streamPath, store]);

  return useStore(store);
}
