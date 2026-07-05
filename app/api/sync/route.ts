/**
 * Poller trigger — syncs every live match once (CLAUDE.md §3.2).
 *
 * DEPLOYMENT TRADEOFF (documented per spec):
 *  - Single always-on instance (`next start` on Railway/Fly, ~$5/mo): you
 *    don't need this route for freshness — the SSE tickers poll while anyone
 *    is watching. Hitting it is still useful to warm state before traffic.
 *  - Vercel/serverless + Upstash: functions can't run persistent tickers, so
 *    THIS route is the writer. Vercel Cron floors at 1/min — for the 4s live
 *    cadence, chain Upstash QStash messages (QStash → /api/sync → schedule
 *    next in 4s) or run the tiny worker instead.
 *
 * Auth: set SYNC_SECRET and call with `Authorization: Bearer <secret>`
 * (or `?secret=`). Unset = open, for local dev only.
 */
import { syncMatch } from "@/lib/live/poller";
import { liveSource } from "@/lib/live/source";
import { getLiveStore } from "@/lib/live/store";
import { dateKey } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const secret = process.env.SYNC_SECRET;
  if (!secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

async function runSync(matchIdParam: string | null) {
  const store = getLiveStore();
  const ids: string[] = [];
  if (matchIdParam) {
    ids.push(matchIdParam);
  } else {
    const fixtures = await liveSource.getFixtures(dateKey(new Date()));
    ids.push(...fixtures.filter((f) => f.status === "live" || f.status === "innings-break").map((f) => f.id));
  }

  const synced = [];
  for (const id of ids) {
    try {
      const result = await syncMatch(id, store, liveSource);
      synced.push({
        matchId: id,
        status: result.state.header.status,
        version: result.state.version,
        newEvents: result.newEvents,
        nextPollMs: result.nextPollMs,
      });
    } catch (err) {
      synced.push({ matchId: id, error: err instanceof Error ? err.message : "sync failed" });
    }
  }
  return { at: new Date().toISOString(), store: store.kind, count: synced.length, synced };
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const matchId = new URL(req.url).searchParams.get("matchId");
  return Response.json(await runSync(matchId));
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
