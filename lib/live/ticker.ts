/**
 * Per-match poll loop, refcounted by connected SSE clients: the first viewer
 * starts it, the last viewer's disconnect stops it — the provider is polled
 * once per match per interval no matter how many clients watch (CLAUDE.md §2.3).
 *
 * Only drives polling for the memory store (single-instance deployments).
 * With Upstash, the writer is /api/sync (cron/QStash/worker) and SSE
 * connections deliver via the store's version poll — see lib/live/store.ts.
 */
import { pollIntervalMs, syncMatch } from "./poller";
import type { LiveSource } from "./source";
import type { LiveStore } from "./store";

interface TickerEntry {
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
}

const globalStore = globalThis as unknown as { __stadiumxTickers?: Map<string, TickerEntry> };
const tickers = (globalStore.__stadiumxTickers ??= new Map<string, TickerEntry>());

export function attachTicker(matchId: string, store: LiveStore, source: LiveSource, initialDelayMs = 4_000) {
  let entry = tickers.get(matchId);
  if (!entry) {
    entry = { refs: 0, timer: null, running: false };
    tickers.set(matchId, entry);
  }
  entry.refs += 1;
  if (store.kind !== "memory") return; // external writer owns polling
  if (!entry.running) {
    entry.running = true;
    schedule(matchId, entry, store, source, initialDelayMs);
  }
}

export function detachTicker(matchId: string) {
  const entry = tickers.get(matchId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    if (entry.timer) clearTimeout(entry.timer);
    tickers.delete(matchId);
  }
}

function schedule(matchId: string, entry: TickerEntry, store: LiveStore, source: LiveSource, delayMs: number) {
  entry.timer = setTimeout(async () => {
    if (entry.refs <= 0) {
      entry.running = false;
      return;
    }
    let next = pollIntervalMs("live");
    try {
      const result = await syncMatch(matchId, store, source);
      if (result.done) {
        entry.running = false;
        return;
      }
      next = result.nextPollMs;
    } catch (err) {
      console.error(`[live:ticker] sync failed for ${matchId}:`, err);
      next = 15_000; // back off on provider hiccups, keep the stream alive
    }
    schedule(matchId, entry, store, source, next);
  }, delayMs);
}

/** Test hook. */
export function resetTickers() {
  for (const entry of tickers.values()) if (entry.timer) clearTimeout(entry.timer);
  tickers.clear();
}
