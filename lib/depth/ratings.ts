/**
 * Live 0–10 match ratings (Phase 5, CLAUDE.md §6 "Lineups tab") — our version
 * of FotMob's player ratings, computed from the scorecard alone so they work
 * for live and finished matches on every provider.
 *
 * Pure and deterministic: runs + strike rate vs a format par, wickets +
 * economy vs par, small fielding credits parsed from dismissal text. A player
 * with no involvement yet has NO rating (undefined), mirroring FotMob's
 * "no rating until they've done something" honesty.
 */
import type { MatchFormat, Scorecard } from "@/lib/providers/types";

/** Format pars the bonuses are measured against. */
const PAR: Record<MatchFormat, { strikeRate: number; economy: number }> = {
  T20: { strikeRate: 130, economy: 8.0 },
  ODI: { strikeRate: 88, economy: 5.6 },
  TEST: { strikeRate: 50, economy: 3.2 },
  T10: { strikeRate: 150, economy: 9.5 },
  HUNDRED: { strikeRate: 135, economy: 8.4 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export interface RatingBreakdown {
  rating: number; // 1.0 .. 10.0, one decimal
  batted: boolean;
  bowled: boolean;
  fieldingCredits: number;
}

/**
 * Fielding credits from dismissal strings ("c Salt b Rashid", "st Buttler b
 * Rashid", "run out (Livingstone)"). Matched by surname — a heuristic, but
 * dismissal text is the only fielding signal a scorecard carries.
 */
export function fieldingCredits(scorecard: Scorecard, fieldingTeamId: string, surname: string): number {
  let credits = 0;
  const needle = surname.toLowerCase();
  for (const inn of scorecard.innings) {
    if (inn.bowlingTeamId !== fieldingTeamId) continue;
    for (const b of inn.batting) {
      const d = b.dismissal.toLowerCase();
      if (!b.isOut || !d) continue;
      if (d.startsWith(`c ${needle} b`) || d === `c ${needle}` || d.startsWith(`st ${needle} b`)) credits += 1;
      else if (d.startsWith("run out") && d.includes(`(${needle}`)) credits += 1;
      else if (d.startsWith("c and b") && d.includes(needle)) credits += 1;
    }
  }
  return credits;
}

/** All ratings for one match keyed by playerId. Players not yet involved are absent. */
export function matchRatings(scorecard: Scorecard, format: MatchFormat): Map<string, RatingBreakdown> {
  const par = PAR[format];
  const out = new Map<string, RatingBreakdown>();
  const ensure = (playerId: string) => {
    let entry = out.get(playerId);
    if (!entry) {
      entry = { rating: 5, batted: false, bowled: false, fieldingCredits: 0 };
      out.set(playerId, entry);
    }
    return entry;
  };

  const names = new Map<string, { name: string; teamIds: Set<string> }>();
  const remember = (playerId: string, name: string, teamId: string) => {
    const rec = names.get(playerId) ?? { name, teamIds: new Set<string>() };
    rec.teamIds.add(teamId);
    names.set(playerId, rec);
  };

  for (const inn of scorecard.innings) {
    for (const b of inn.batting) {
      remember(b.playerId, b.playerName, inn.battingTeamId);
      if (b.balls === 0 && !b.isOut) continue; // hasn't faced a ball — no involvement
      const entry = ensure(b.playerId);
      entry.batted = true;
      entry.rating += Math.min(b.runs * 0.06, 3.2);
      if (b.balls >= 4 && b.strikeRate !== null) {
        const weight = Math.min(b.balls / 15, 1);
        entry.rating += clamp(((b.strikeRate - par.strikeRate) / par.strikeRate) * 1.6 * weight, -1.2, 1.2);
      }
      if (b.runs === 0 && b.isOut) entry.rating -= 0.75;
      if (!b.isOut && b.runs >= 20) entry.rating += 0.3;
    }
    for (const b of inn.bowling) {
      remember(b.playerId, b.playerName, inn.bowlingTeamId);
      if (b.legalBalls === 0) continue;
      const entry = ensure(b.playerId);
      entry.bowled = true;
      entry.rating += Math.min(b.wickets * 1.05, 3.5);
      entry.rating += b.maidens * 0.25;
      if (b.economy !== null && b.legalBalls >= 6) {
        const weight = Math.min(b.legalBalls / 18, 1);
        entry.rating += clamp(((par.economy - b.economy) / par.economy) * 1.8 * weight, -1.5, 1.5);
      }
    }
  }

  // Fielding credits for everyone we have a name + team for.
  for (const [playerId, rec] of names) {
    const surname = rec.name.trim().split(/\s+/).at(-1) ?? rec.name;
    let credits = 0;
    for (const teamId of rec.teamIds) credits += fieldingCredits(scorecard, teamId, surname);
    if (credits > 0) {
      const entry = ensure(playerId);
      entry.fieldingCredits = credits;
      entry.rating += credits * 0.25;
    }
  }

  for (const entry of out.values()) entry.rating = Math.round(clamp(entry.rating, 1, 10) * 10) / 10;
  return out;
}

/** Tone bucket for the rating badge — gold ≥8, green ≥7, neutral ≥5, red below. */
export function ratingTone(rating: number): "top" | "good" | "ok" | "poor" {
  if (rating >= 8) return "top";
  if (rating >= 7) return "good";
  if (rating >= 5) return "ok";
  return "poor";
}
