/** Cricket math + display formatting. Pure functions — unit-tested. */
import type { Fixture, InningsSummary, MatchFormat } from "@/lib/providers/types";

/** 112 legal balls → "18.4"; 120 → "20". */
export function formatOvers(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6);
  const balls = legalBalls % 6;
  return balls === 0 ? `${overs}` : `${overs}.${balls}`;
}

/** "18.4" → 112 legal balls. */
export function oversToBalls(oversText: string): number {
  const [overs = "0", balls = "0"] = oversText.split(".");
  return Number(overs) * 6 + Number(balls);
}

/** Runs per over, 2dp. Null when no legal ball bowled yet. */
export function runRate(runs: number, legalBalls: number): number | null {
  if (legalBalls <= 0) return null;
  return Math.round((runs / legalBalls) * 6 * 100) / 100;
}

export function strikeRate(runs: number, balls: number): number | null {
  if (balls <= 0) return null;
  return Math.round((runs / balls) * 100 * 100) / 100;
}

/** "189/7" — the hero figure. All out shows plain "189". */
export function scoreLine(i: InningsSummary): string {
  return i.wickets >= 10 ? `${i.runs}` : `${i.runs}/${i.wickets}`;
}

export interface ChaseState {
  target: number;
  runsNeeded: number;
  ballsRemaining: number;
  requiredRate: number | null;
}

/**
 * Chase equation for the 2nd innings of a limited-overs game.
 * Returns null when it doesn't apply (1st innings, tests, no data).
 */
export function chaseState(fixture: Fixture): ChaseState | null {
  const { innings, oversPerInnings } = fixture;
  if (!oversPerInnings || innings.length < 2) return null;
  const first = innings[0];
  const chasing = innings[innings.length - 1];
  if (!first || !chasing || first.battingTeamId === chasing.battingTeamId) return null;
  const target = first.runs + 1;
  const runsNeeded = Math.max(target - chasing.runs, 0);
  const ballsRemaining = Math.max(oversPerInnings * 6 - chasing.legalBalls, 0);
  return {
    target,
    runsNeeded,
    ballsRemaining,
    requiredRate:
      ballsRemaining > 0
        ? Math.round((runsNeeded / ballsRemaining) * 6 * 100) / 100
        : null,
  };
}

/** "England need 98 off 52 balls" — the context line Cricbuzz fumbles. */
export function chaseSentence(teamName: string, chase: ChaseState): string {
  if (chase.runsNeeded === 0) return `${teamName} have won`;
  if (chase.ballsRemaining === 0)
    return `${teamName} fell ${chase.runsNeeded - 1 === 0 ? "short — tied" : `${chase.runsNeeded} short`}`;
  const balls = chase.ballsRemaining === 1 ? "ball" : "balls";
  return `${teamName} need ${chase.runsNeeded} off ${chase.ballsRemaining} ${balls}`;
}

export const FORMAT_LABEL: Record<MatchFormat, string> = {
  T20: "T20",
  ODI: "ODI",
  TEST: "Test",
  T10: "T10",
  HUNDRED: "The Hundred",
};

export function formatOversPerInnings(format: MatchFormat): number | undefined {
  if (format === "T20") return 20;
  if (format === "ODI") return 50;
  if (format === "T10") return 10;
  return undefined;
}

// ── Dates ────────────────────────────────────────────────────────────────────

/** Local YYYY-MM-DD key for a Date. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T00:00:00`);
  return !Number.isNaN(d.getTime()) && dateKey(d) === key;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

/** "Yesterday" / "Today" / "Tomorrow" / "Fri 4 Jul" relative to `today`. */
export function dayLabel(key: string, todayKey: string): string {
  const target = new Date(`${key}T00:00:00`);
  const today = new Date(`${todayKey}T00:00:00`);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff === -1) return "Yesterday";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return target.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Venue-local kickoff time, honestly labeled: "19:00 IST". */
export function venueLocalTime(iso: string, timezone?: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
  if (!timezone) return time;
  const tzName = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    timeZoneName: "short",
  })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value;
  return tzName ? `${time} ${tzName}` : time;
}

export function venueLocalDate(iso: string, timezone?: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });
}

/** "18.4" ball reference from a BallRef-ish pair. */
export function ballLabel(over: number, ball: number): string {
  return `${over}.${ball}`;
}
