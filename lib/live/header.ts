/**
 * Pure header math — evolves innings summaries ball by ball. Used by the
 * replay engine (rebuilding a match from raw deliveries) and to shape the
 * initial snapshot on the server. No IO, safe for client and server.
 */
import { chaseSentence, chaseState, formatOvers } from "@/lib/format";
import type { BallEvent, InningsSummary, MatchDetail } from "@/lib/providers/types";
import type { LiveHeader, WireSnapshot } from "./types";

/** The header a real provider reports right now — trusted as-is. */
export function headerFromDetail(detail: MatchDetail): LiveHeader {
  return {
    status: detail.status,
    statusText: detail.statusText,
    innings: detail.innings,
    ...(detail.battingTeamId ? { battingTeamId: detail.battingTeamId } : {}),
    ...(detail.lastBall ? { lastBall: detail.lastBall } : {}),
  };
}

/** Which team bats innings N — from known summaries, else alternate home/away. */
export function inningsTeamResolver(detail: MatchDetail): (inningsNumber: number) => string {
  return (n: number) => {
    const known = detail.innings.find((i) => i.number === n);
    if (known) return known.battingTeamId;
    const first = detail.innings[0]?.battingTeamId ?? detail.teams.home.id;
    const other = first === detail.teams.home.id ? detail.teams.away.id : detail.teams.home.id;
    return n % 2 === 1 ? first : other;
  };
}

/** Apply one delivery to the summaries. Returns a new array — input untouched. */
export function applyEventToInnings(
  innings: InningsSummary[],
  event: BallEvent,
  teamForInnings: (n: number) => string,
): InningsSummary[] {
  const next = innings.map((i) => ({ ...i }));
  while (next.length < event.innings) {
    next.push({
      number: next.length + 1,
      battingTeamId: teamForInnings(next.length + 1),
      runs: 0,
      wickets: 0,
      oversText: "0",
      legalBalls: 0,
    });
  }
  const current = next[event.innings - 1];
  if (!current) return next;
  current.runs += event.runs.total;
  if (event.wicket) current.wickets += 1;
  if (event.extraType !== "wide" && event.extraType !== "noball") current.legalBalls += 1;
  current.oversText = formatOvers(current.legalBalls);
  return next;
}

export type LivePhase = "live" | "innings-break" | "completed";

/** Build the header for a derived (replayed) state. */
export function buildHeader(detail: MatchDetail, innings: InningsSummary[], lastEvent: BallEvent | null, phase: LivePhase): LiveHeader {
  const current = innings[innings.length - 1];
  const battingTeamId = current?.battingTeamId;
  const battingTeam = [detail.teams.home, detail.teams.away].find((t) => t.id === battingTeamId);

  let status: LiveHeader["status"] = phase === "completed" ? "completed" : phase;
  let statusText: string;

  if (phase === "completed") {
    status = "completed";
    statusText = detail.resultText ?? detail.statusText;
  } else if (phase === "innings-break") {
    const first = innings[0];
    statusText = first ? `Innings break — target ${first.runs + 1}` : "Innings break";
  } else {
    const chase = chaseState({ ...detail, status: "live", innings, ...(battingTeamId ? { battingTeamId } : {}) });
    statusText = chase && battingTeam ? chaseSentence(battingTeam.name, chase) : `${battingTeam?.name ?? "Batting side"} batting`;
  }

  return {
    status,
    statusText,
    innings,
    ...(battingTeamId ? { battingTeamId } : {}),
    ...(lastEvent ? { lastBall: { innings: lastEvent.innings, over: lastEvent.over, ball: lastEvent.ball } } : {}),
  };
}

/** Server-rendered starting point for the client store — version 0 so the SSE
 *  snapshot (version ≥ 1) always supersedes it. */
export function initialSnapshot(detail: MatchDetail, events: BallEvent[]): WireSnapshot {
  return {
    kind: "snapshot",
    matchId: detail.id,
    version: 0,
    detail,
    header: headerFromDetail(detail),
    events,
    updatedAt: new Date().toISOString(),
  };
}
