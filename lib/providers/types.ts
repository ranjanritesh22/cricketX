/**
 * Canonical domain types — the contract everything depends on (CLAUDE.md §3.3).
 *
 * `BallEvent` and `SynthesizedShot` are specced verbatim in CLAUDE.md.
 * Do NOT change their shape without explicit approval — the Shot Synthesizer
 * (Phase 3) and the 3D engine (Phase 4) are built against them.
 */

// ───────────────────────────── Matches & fixtures ─────────────────────────────

export type MatchFormat = "T20" | "ODI" | "TEST" | "T10" | "HUNDRED";

export type MatchStatus =
  | "upcoming"
  | "live"
  | "innings-break"
  | "stumps"
  | "completed"
  | "abandoned"
  | "no-result";

export interface TeamRef {
  id: string;
  name: string;
  shortName: string;
  /** ISO 3166-1 alpha-2 — renders an emoji flag. Absent for franchises (monogram instead). */
  countryCode?: string;
  /** Kit/brand color hex, used for monograms and accents. */
  primaryColor?: string;
}

export interface VenueRef {
  id?: string;
  name: string;
  city?: string;
  country?: string;
  /** IANA timezone — start times render venue-local, honestly labeled. */
  timezone?: string;
}

export interface InningsSummary {
  number: number;
  battingTeamId: string;
  runs: number;
  wickets: number;
  /** Display form, e.g. "18.4". */
  oversText: string;
  /** Legal balls bowled — the number rate math trusts. */
  legalBalls: number;
  declared?: boolean;
  followOn?: boolean;
}

export interface Fixture {
  id: string;
  seriesId: string;
  seriesName: string;
  format: MatchFormat;
  /** "3rd T20I", "Final", "Match 12" … */
  title?: string;
  status: MatchStatus;
  /**
   * Human status line: "England need 98 off 52 balls",
   * "India won by 24 runs", "Starts 19:00".
   */
  statusText: string;
  /** ISO 8601 instant. */
  startTime: string;
  /** Local date key (YYYY-MM-DD) used to group fixtures per day. */
  dateKey: string;
  venue: VenueRef;
  teams: { home: TeamRef; away: TeamRef };
  /** Chronological; empty before the first ball. */
  innings: InningsSummary[];
  /** 20 for T20, 50 for ODI; undefined for timeless/first-class contexts. */
  oversPerInnings?: number;
  /** Which team is at the crease right now (live matches only). */
  battingTeamId?: string;
  /**
   * The honest latency anchor — "Last ball: 18.4" instead of a fake
   * instant-LIVE dot (CLAUDE.md §2.2).
   */
  lastBall?: BallRef;
}

export interface Series {
  id: string;
  name: string;
  shortName?: string;
  formats: MatchFormat[];
  /** ISO dates. */
  startDate?: string;
  endDate?: string;
  teamIds?: string[];
}

export interface MatchDetail extends Fixture {
  toss?: { winnerTeamId: string; decision: "bat" | "field" };
  /** Final result sentence for completed games. */
  resultText?: string;
  officials?: { umpires?: string[]; tvUmpire?: string; referee?: string };
  /** "Series level 1–1", "IND lead 2–0" … */
  seriesStatusText?: string;
  playerOfMatchId?: string;
  playerOfMatchName?: string;
}

// ───────────────────────────────── Scorecard ─────────────────────────────────

export interface BattingEntry {
  playerId: string;
  playerName: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  /** null before a ball is faced. */
  strikeRate: number | null;
  /** "c Salt b Rashid", "not out", "st Buttler b Rashid" … */
  dismissal: string;
  isOut: boolean;
  battingOrder: number;
  isOnStrike?: boolean;
}

export interface BowlingEntry {
  playerId: string;
  playerName: string;
  /** "4" or "3.2". */
  oversText: string;
  legalBalls: number;
  maidens: number;
  runs: number;
  wickets: number;
  /** null before a legal ball is bowled. */
  economy: number | null;
  wides?: number;
  noballs?: number;
}

export interface FallOfWicket {
  wicket: number;
  runs: number;
  oversText: string;
  playerId: string;
  playerName: string;
}

export interface ExtrasBreakdown {
  byes: number;
  legbyes: number;
  wides: number;
  noballs: number;
  penalty: number;
  total: number;
}

export interface InningsScorecard {
  number: number;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  oversText: string;
  legalBalls: number;
  extras: ExtrasBreakdown;
  batting: BattingEntry[];
  bowling: BowlingEntry[];
  fallOfWickets: FallOfWicket[];
  yetToBat: { playerId: string; playerName: string }[];
  runRate: number | null;
  isDeclared?: boolean;
}

export interface Scorecard {
  matchId: string;
  innings: InningsScorecard[];
}

// ─────────────────────────────── Squads & players ───────────────────────────

export type PlayerRole = "batter" | "bowler" | "allrounder" | "wicketkeeper";
export type BattingHand = "right" | "left";

export interface SquadPlayer {
  id: string;
  name: string;
  role?: PlayerRole;
  /** Handedness mirrors the wagon wheel for lefties (Shot Synthesizer input). */
  battingHand?: BattingHand;
  bowlingStyle?: string;
  isCaptain?: boolean;
  isKeeper?: boolean;
  isPlaying?: boolean;
}

export interface Squads {
  matchId: string;
  teams: { team: TeamRef; players: SquadPlayer[] }[];
}

export interface CareerBattingStats {
  matches?: number;
  runs?: number;
  average?: number | null;
  strikeRate?: number | null;
  hundreds?: number;
  fifties?: number;
  highScore?: string;
}

export interface CareerBowlingStats {
  matches?: number;
  wickets?: number;
  average?: number | null;
  economy?: number | null;
  bestFigures?: string;
}

export interface PlayerProfile {
  id: string;
  name: string;
  countryCode?: string;
  country?: string;
  role?: PlayerRole;
  battingHand?: BattingHand;
  bowlingStyle?: string;
  born?: string;
  /** Licensed or stylized only — never hotlinked (CLAUDE.md §12). */
  imageUrl?: string;
  batting?: Partial<Record<MatchFormat, CareerBattingStats>>;
  bowling?: Partial<Record<MatchFormat, CareerBowlingStats>>;
}

// ─────────────────────────────── Points table ───────────────────────────────

export interface PointsTableRow {
  teamId: string;
  teamName: string;
  teamShortName: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  netRunRate: number | null;
}

export interface PointsTable {
  seriesId: string;
  groups: { name?: string; rows: PointsTableRow[] }[];
}

// ────────────────────────────── Ball-by-ball core ────────────────────────────

export interface BallRef {
  innings: number;
  over: number;
  ball: number;
}

/** Aligned with Cricsheet's wicket kinds. */
export type WicketKind =
  | "bowled"
  | "caught"
  | "caught and bowled"
  | "lbw"
  | "stumped"
  | "run out"
  | "hit wicket"
  | "retired hurt"
  | "retired out"
  | "retired not out"
  | "obstructing the field"
  | "handled the ball"
  | "hit the ball twice"
  | "timed out";

export type ExtraType = "wide" | "noball" | "bye" | "legbye" | "penalty";

/**
 * The ~40-position fielding dictionary. Polar coordinates for each position
 * land with the Shot Synthesizer (Phase 3); the names are part of the domain
 * contract now because `SynthesizedShot.fielderRole` references them.
 */
export const FIELDING_POSITIONS = [
  "wicketkeeper",
  "slip",
  "leg-slip",
  "gully",
  "leg-gully",
  "silly-point",
  "silly-mid-off",
  "silly-mid-on",
  "short-leg",
  "point",
  "backward-point",
  "cover-point",
  "cover",
  "extra-cover",
  "mid-off",
  "mid-on",
  "midwicket",
  "square-leg",
  "backward-square-leg",
  "short-third",
  "short-fine-leg",
  "short-midwicket",
  "short-cover",
  "deep-point",
  "deep-backward-point",
  "sweeper-cover",
  "deep-cover",
  "deep-extra-cover",
  "long-off",
  "long-on",
  "deep-midwicket",
  "cow-corner",
  "deep-square-leg",
  "deep-backward-square-leg",
  "deep-fine-leg",
  "fine-leg",
  "long-leg",
  "third-man",
  "deep-third",
  "long-stop",
] as const;

export type FieldingPosition = (typeof FIELDING_POSITIONS)[number];

// ── Specced verbatim in CLAUDE.md §3.3 — do not modify without approval ──────

export type BallEvent = {
  matchId: string;
  innings: number;
  over: number; // 18
  ball: number; // 4  → "18.4"
  bowlerId: string;
  batterId: string;
  nonStrikerId: string;
  runs: { batter: number; extras: number; total: number };
  extraType?: "wide" | "noball" | "bye" | "legbye" | "penalty";
  wicket?: { kind: WicketKind; playerOutId: string; fielderIds: string[] };
  commentaryText: string; // raw provider text — input to the synthesizer
  // ↓ Derived by our Shot Synthesizer (section 4), never from provider:
  synth?: SynthesizedShot;
  timestamp: string;
};

export type SynthesizedShot = {
  deliveryType: "pace" | "spin";
  length: "yorker" | "full" | "good" | "short" | "bouncer";
  line: "off" | "middle" | "leg" | "wide-off" | "wide-leg";
  shotType:
    | "defend"
    | "drive"
    | "cut"
    | "pull"
    | "sweep"
    | "flick"
    | "loft"
    | "slog"
    | "edge"
    | "leave"
    | "missed"
    | "run-out-scramble";
  wagonZone: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // standard 8-zone wagon wheel, zone 1 = fine leg (RH batter)
  trajectory: "ground" | "flat" | "lofted" | "skier";
  landingRadius: number; // 0..1 fraction of boundary distance
  fielderRole?: FieldingPosition; // 'sweeper-cover', 'deep-midwicket', etc.
  runsScored: number;
  isBoundary: boolean;
  confidence: number; // 0..1 — parser certainty; below 0.5 use generic animation
};
