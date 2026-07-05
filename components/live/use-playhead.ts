"use client";

/**
 * The reconstruction playhead — a tiny per-stream store that carries the key of
 * the ball the 3D/2D stadium is *currently reconstructing*. The panel writes
 * it; the commentary feed reads it to highlight and scroll to the exact same
 * delivery, so the Cricbuzz-style ball-by-ball list stays in lockstep with the
 * stadium (including while the ambient loop replays the last over).
 *
 * Keyed by `streamPath` — the same identity both components already share — so
 * a match and its replay never cross wires. State is a plain vanilla store (not
 * React context) so a 60fps-adjacent write never re-renders the whole tree;
 * only subscribers that select `key` re-render, and only when it changes.
 */
import { useMemo } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

interface PlayheadState {
  /** `${innings}-${over}-${ball}-${timestamp}` — matches the feed's row key. */
  key: string | null;
}

const registry = new Map<string, StoreApi<PlayheadState>>();

function storeFor(streamPath: string): StoreApi<PlayheadState> {
  let store = registry.get(streamPath);
  if (!store) {
    store = createStore<PlayheadState>(() => ({ key: null }));
    registry.set(streamPath, store);
  }
  return store;
}

/** Subscribe to the ball currently on screen in the stadium. */
export function usePlayhead(streamPath: string): string | null {
  const store = useMemo(() => storeFor(streamPath), [streamPath]);
  return useStore(store, (s) => s.key);
}

/** Publish the ball the stadium is reconstructing (called by the panel). */
export function setPlayhead(streamPath: string, key: string | null): void {
  const store = storeFor(streamPath);
  if (store.getState().key !== key) store.setState({ key });
}
