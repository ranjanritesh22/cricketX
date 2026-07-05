import Link from "next/link";
import { getBallByBall, getMatchOr404 } from "@/lib/data";
import { initialSnapshot } from "@/lib/live/header";
import { parseSpeed } from "@/lib/live/replay";
import { venueLocalDate, venueLocalTime } from "@/lib/format";
import { LiveFeed } from "@/components/live/live-feed";
import { MatchAlerts } from "@/components/live/match-alerts";
import { ReconstructionPanel } from "@/components/pitch/reconstruction-panel";
import { RecentBalls } from "@/components/match/recent-balls";
import { SNAPSHOT_EVENT_CAP } from "@/lib/live/types";

export const dynamic = "force-dynamic";

/** Stylized top-down field — static placeholder for upcoming/finished states. */
function FieldPreview() {
  return (
    <svg viewBox="0 0 400 220" className="h-auto w-full" role="img" aria-label="Stadium field preview">
      <defs>
        <radialGradient id="turf" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#17351F" />
          <stop offset="100%" stopColor="#0E2013" />
        </radialGradient>
        <linearGradient id="preview-trail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#F5B82E" stopOpacity="0" />
          <stop offset="1" stopColor="#F5B82E" />
        </linearGradient>
      </defs>
      <ellipse cx="200" cy="110" rx="185" ry="95" fill="url(#turf)" stroke="#1F2831" strokeWidth="2" />
      <ellipse cx="200" cy="110" rx="70" ry="36" fill="none" stroke="#2E4A36" strokeWidth="1.5" strokeDasharray="4 5" />
      <rect x="188" y="76" width="24" height="68" rx="3" fill="#8A6B3A" opacity="0.85" />
      <path d="M120 170 C 160 160, 205 140, 250 96" stroke="url(#preview-trail)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <circle cx="253" cy="92" r="5.5" fill="#F5B82E" />
    </svg>
  );
}

function StaticPanel({ chip, caption }: { chip: string; caption: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-edge bg-card">
      <div className="relative">
        <FieldPreview />
        <span className="absolute top-3 left-3 rounded-full bg-night/80 px-2.5 py-1 text-[10px] font-bold tracking-wide text-ink-soft uppercase backdrop-blur">
          {chip}
        </span>
      </div>
      <p className="border-t border-edge px-4 py-3 text-xs leading-relaxed text-ink-soft">{caption}</p>
    </section>
  );
}

export default async function LivePage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ replay?: string; speed?: string }>;
}) {
  const [{ matchId }, sp] = await Promise.all([params, searchParams]);
  const detail = await getMatchOr404(matchId);
  const replayId = typeof sp.replay === "string" && sp.replay.length > 0 ? sp.replay : null;
  const speedRaw = typeof sp.speed === "string" ? sp.speed : "8x";
  const isLive = detail.status === "live" || detail.status === "innings-break";
  const events = detail.status === "upcoming" ? [] : await getBallByBall(matchId).catch(() => []);

  // Live match or replay session → the streaming pipeline (SSE + client store).
  if (replayId || isLive) {
    const search = replayId
      ? `?replay=${encodeURIComponent(replayId)}&speed=${encodeURIComponent(speedRaw)}`
      : "";
    const streamPath = `/api/live/${encodeURIComponent(matchId)}${search}`;
    // Real live matches hydrate from a server snapshot (no pop-in); replay
    // sessions are built on connect, so the stream delivers their first state.
    const initial = replayId ? null : initialSnapshot(detail, events.slice(-SNAPSHOT_EVENT_CAP));

    return (
      <div className="animate-fade-up space-y-4">
        <ReconstructionPanel
          streamPath={streamPath}
          initial={initial}
          chip={replayId ? `Replay · ${parseSpeed(speedRaw)}x` : "Live Reconstruction"}
        />
        <div className="flex justify-end">
          <MatchAlerts streamPath={streamPath} />
        </div>
        <LiveFeed streamPath={streamPath} initial={initial} />
      </div>
    );
  }

  if (detail.status === "upcoming") {
    return (
      <div className="animate-fade-up space-y-4">
        <StaticPanel
          chip="Live Reconstruction"
          caption="The reconstruction and ball-by-ball stream go live with the first delivery."
        />
        <section className="rounded-2xl border border-edge bg-card px-6 py-12 text-center">
          <p className="font-display text-lg font-bold text-ink">Not started yet</p>
          <p className="mt-2 text-sm text-ink-soft">
            First ball {venueLocalDate(detail.startTime, detail.venue.timezone)} at{" "}
            {venueLocalTime(detail.startTime, detail.venue.timezone)}, {detail.venue.name}.
          </p>
        </section>
      </div>
    );
  }

  // Completed / abandoned: final deliveries + a replay entry when we hold the full feed.
  const recent = events.slice(-12);
  return (
    <div className="animate-fade-up space-y-4">
      <StaticPanel
        chip="Live Reconstruction"
        caption={
          events.length > 0 ? (
            <span className="flex items-center justify-between gap-3">
              <span>
                This match is finished — replay it ball by ball through the same live pipeline.
              </span>
              <Link
                href={`?replay=${encodeURIComponent(matchId)}&speed=8x`}
                className="shrink-0 rounded-full bg-gold px-3.5 py-1.5 text-xs font-bold text-night transition-opacity hover:opacity-90"
              >
                ▶ Watch replay
              </Link>
            </span>
          ) : (
            "No ball-by-ball data is available for this match."
          )
        }
      />
      {recent.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-edge bg-card">
          <header className="border-b border-edge px-4 py-2.5">
            <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Final deliveries</h2>
          </header>
          <RecentBalls events={recent} />
        </section>
      )}
    </div>
  );
}
