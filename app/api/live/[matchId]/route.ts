/**
 * SSE endpoint — every connected client subscribes here (CLAUDE.md §3.2).
 *
 * Protocol: `retry` hint → `snapshot` (full state, once) → `ball`/`status`
 * deltas (< 2 KB each) → `: ping` keep-alives every 15s. EventSource
 * auto-reconnects and receives a fresh snapshot, which heals any gap.
 *
 * `?replay=<match-id>&speed=8x` attaches to a replay session instead of the
 * live pipeline — same wire protocol, same client code.
 */
import { ensureSnapshot } from "@/lib/live/poller";
import { acquireReplaySession, isReplayUnavailableError } from "@/lib/live/replay";
import { acquireStream, clientIp } from "@/lib/live/rate-limit";
import { liveSource } from "@/lib/live/source";
import { getLiveStore, getReplayStore, type LiveStore } from "@/lib/live/store";
import { attachTicker, detachTicker } from "@/lib/live/ticker";
import { toWireSnapshot, type WireDelta, type WireStatus } from "@/lib/live/types";
import { isMatchNotFoundError, isProviderError } from "@/lib/providers/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIVE_STATUSES = new Set(["live", "innings-break", "stumps", "upcoming"]);

export async function GET(req: Request, ctx: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await ctx.params;
  const url = new URL(req.url);
  const replayId = url.searchParams.get("replay");

  const permit = acquireStream(clientIp(req.headers));
  if (!permit.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } });
  }

  const cleanups: (() => void)[] = [permit.release];
  const runCleanups = () => {
    while (cleanups.length) {
      try {
        cleanups.pop()?.();
      } catch {
        // cleanup must never throw past the stream teardown
      }
    }
  };

  let store: LiveStore;
  let streamId: string;
  try {
    if (replayId) {
      const session = await acquireReplaySession(replayId, url.searchParams.get("speed"));
      cleanups.push(() => session.detach());
      store = getReplayStore();
      streamId = session.key;
    } else {
      store = getLiveStore();
      streamId = matchId;
      const state = await ensureSnapshot(matchId, store, liveSource);
      if (ACTIVE_STATUSES.has(state.header.status)) {
        attachTicker(matchId, store, liveSource);
        cleanups.push(() => detachTicker(matchId));
      }
    }
  } catch (err) {
    runCleanups();
    if (isMatchNotFoundError(err)) {
      return Response.json({ error: "match_not_found" }, { status: 404 });
    }
    if (isReplayUnavailableError(err)) {
      return Response.json({ error: "replay_unavailable", message: err.message }, { status: 404 });
    }
    console.error("[api/live] failed to open stream:", err);
    const status = isProviderError(err) ? 502 : 500;
    return Response.json({ error: "stream_failed" }, { status });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let ping: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;
  let closeStream = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closeStream();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      closeStream = () => {
        if (closed) return;
        closed = true;
        if (ping) clearInterval(ping);
        unsubscribe?.();
        runCleanups();
        try {
          controller.close();
        } catch {
          // already errored/closed by the runtime
        }
      };

      write("retry: 3000\n\n");

      // Subscribe BEFORE reading the snapshot so nothing published in between
      // is lost; buffer until the snapshot has gone out, then flush anything newer.
      let snapshotSent = false;
      const buffered: (WireDelta | WireStatus)[] = [];
      unsubscribe = store.subscribe(streamId, (message) => {
        if (!snapshotSent) buffered.push(message);
        else send(message.kind, message);
      });

      ping = setInterval(() => write(": ping\n\n"), 15_000);
      req.signal.addEventListener("abort", closeStream);

      void (async () => {
        const state = await store.get(streamId);
        if (!state) {
          send("stream-error", { message: "state unavailable" });
          closeStream();
          return;
        }
        send("snapshot", toWireSnapshot(state));
        snapshotSent = true;
        for (const message of buffered.splice(0)) {
          if (message.version > state.version) send(message.kind, message);
        }
      })();
    },
    cancel() {
      closeStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
