import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  ballLabel,
  chaseSentence,
  chaseState,
  FORMAT_LABEL,
  runRate,
  scoreLine,
  venueLocalDate,
  venueLocalTime,
} from "@/lib/format";
import type { MatchDetail, TeamRef } from "@/lib/providers/types";
import { TeamFlag } from "@/components/ui/team-flag";
import { MatchTabBar } from "./tab-bar";

function HeaderTeamLine({ detail, team }: { detail: MatchDetail; team: TeamRef }) {
  const teamInnings = detail.innings.filter((i) => i.battingTeamId === team.id);
  const isLive = detail.status === "live" || detail.status === "innings-break";
  const isBatting = isLive && detail.battingTeamId === team.id;
  const finished = detail.status === "completed";
  const won = finished && detail.statusText.startsWith(team.name);
  const dim = finished && !won;

  return (
    <div className="flex items-center gap-3">
      <TeamFlag team={team} />
      <span className={cn("flex-1 truncate font-display text-base font-bold", dim ? "text-ink-soft" : "text-ink")}>
        {team.name}
      </span>
      {teamInnings.length > 0 ? (
        <span className={cn("score-figures text-xl font-bold", dim ? "text-ink-soft" : "text-ink")}>
          {teamInnings.map((i, idx) => (idx === teamInnings.length - 1 ? `${scoreLine(i)} (${i.oversText})` : scoreLine(i))).join(" & ")}
          {isBatting && <span className="ml-2 inline-block size-1.5 rounded-full bg-gold align-middle" aria-label="batting" />}
        </span>
      ) : (
        <span className="text-sm text-ink-faint">{isLive || finished ? "yet to bat" : ""}</span>
      )}
    </div>
  );
}

/** The honest status line — anchored to the last known ball, never a fake "instant" LIVE. */
function statusLine(detail: MatchDetail): { text: string; tone: "gold" | "soft" } {
  if (detail.status === "live" || detail.status === "innings-break") {
    const chase = chaseState(detail);
    const battingTeam = [detail.teams.home, detail.teams.away].find((t) => t.id === detail.battingTeamId);
    const anchor = detail.lastBall ? ` • Last ball: ${ballLabel(detail.lastBall.over, detail.lastBall.ball)}` : "";
    if (chase && battingTeam) {
      const rrr = chase.requiredRate !== null ? ` • RRR ${chase.requiredRate.toFixed(2)}` : "";
      return { text: `${chaseSentence(battingTeam.name, chase)}${rrr}${anchor}`, tone: "gold" };
    }
    const current = detail.innings.at(-1);
    const crr = current ? runRate(current.runs, current.legalBalls) : null;
    const base = detail.status === "innings-break" ? "Innings break" : detail.statusText;
    return { text: `${base}${crr !== null ? ` • CRR ${crr.toFixed(2)}` : ""}${anchor}`, tone: "gold" };
  }
  if (detail.status === "upcoming") {
    return {
      text: `${venueLocalDate(detail.startTime, detail.venue.timezone)} • ${venueLocalTime(detail.startTime, detail.venue.timezone)}`,
      tone: "soft",
    };
  }
  return { text: detail.resultText ?? detail.statusText, tone: "soft" };
}

export function ScoreHeader({ detail }: { detail: MatchDetail }) {
  const status = statusLine(detail);
  const isLive = detail.status === "live" || detail.status === "innings-break";
  return (
    <header className="sticky top-0 z-40 -mx-3 border-b border-edge bg-night/95 px-3 backdrop-blur sm:-mx-4 sm:px-4">
      <div className="flex items-center gap-2 pt-3 pb-2">
        <Link
          href="/"
          aria-label="Back to matches"
          className="-ml-1 rounded-lg p-1 text-ink-soft transition-colors hover:bg-card hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-soft">
          {detail.seriesName}
          {detail.title ? ` · ${detail.title}` : ""}
        </p>
        <span className="shrink-0 rounded-md bg-card px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">
          {FORMAT_LABEL[detail.format]}
        </span>
      </div>

      <div className="space-y-2 pb-2.5">
        <HeaderTeamLine detail={detail} team={detail.teams.home} />
        <HeaderTeamLine detail={detail} team={detail.teams.away} />
      </div>

      <p className={cn("pb-2.5 text-xs font-semibold", status.tone === "gold" ? "text-gold" : "text-ink-soft")}>
        {status.text}
      </p>

      <MatchTabBar matchId={detail.id} isLive={isLive} />
    </header>
  );
}
