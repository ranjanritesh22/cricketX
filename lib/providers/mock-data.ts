/**
 * Deterministic fixture universe for the mock provider.
 *
 * Everything is generated relative to an injected `now`, so the home screen
 * always shows a live match "today" while tests can freeze time. The numbers
 * are hand-balanced to be internally consistent (batter runs + extras = totals,
 * balls faced = legal balls, bowling figures reconcile) — the provider contract
 * test enforces those invariants.
 *
 * The live match deliberately reproduces the CLAUDE.md reference scenario:
 * IND 189/7 (20) v ENG 92/3 (11.2) at the Wankhede — "England need 98 off 52",
 * including the "Rashid to Axar, cut to sweeper cover" and the Buttler
 * stumping commentary lines the Shot Synthesizer (Phase 3) is specced against.
 */
import { addDays, dateKey, strikeRate, runRate, venueLocalTime } from "@/lib/format";
import type {
  BallEvent,
  BattingEntry,
  BowlingEntry,
  ExtrasBreakdown,
  FallOfWicket,
  Fixture,
  InningsScorecard,
  MatchDetail,
  PlayerProfile,
  PointsTable,
  Scorecard,
  Series,
  Squads,
  TeamRef,
} from "./types";

export interface MockUniverse {
  fixtures: Fixture[];
  details: Record<string, MatchDetail>;
  scorecards: Record<string, Scorecard>;
  balls: Record<string, BallEvent[]>;
  squads: Record<string, Squads>;
  players: Record<string, PlayerProfile>;
  series: Series[];
  pointsTables: Record<string, PointsTable>;
}

// ── Teams ────────────────────────────────────────────────────────────────────

const T = {
  ind: { id: "t-ind", name: "India", shortName: "IND", countryCode: "IN", primaryColor: "#1E6FD9" },
  eng: { id: "t-eng", name: "England", shortName: "ENG", countryCode: "GB", primaryColor: "#C8102E" },
  miny: { id: "t-miny", name: "MI New York", shortName: "MINY", primaryColor: "#1266E3" },
  tsk: { id: "t-tsk", name: "Texas Super Kings", shortName: "TSK", primaryColor: "#E8B812" },
  seo: { id: "t-seo", name: "Seattle Orcas", shortName: "SEO", primaryColor: "#0FA36B" },
  sfu: { id: "t-sfu", name: "San Francisco Unicorns", shortName: "SFU", primaryColor: "#F97316" },
  wsh: { id: "t-wsh", name: "Washington Freedom", shortName: "WSH", primaryColor: "#16A34A" },
  lakr: { id: "t-lakr", name: "Los Angeles Knight Riders", shortName: "LAKR", primaryColor: "#6D28D9" },
} satisfies Record<string, TeamRef>;

const WANKHEDE = { name: "Wankhede Stadium", city: "Mumbai", country: "India", timezone: "Asia/Kolkata" };
const AHMEDABAD = { name: "Narendra Modi Stadium", city: "Ahmedabad", country: "India", timezone: "Asia/Kolkata" };
const DELHI = { name: "Arun Jaitley Stadium", city: "Delhi", country: "India", timezone: "Asia/Kolkata" };
const BENGALURU = { name: "M. Chinnaswamy Stadium", city: "Bengaluru", country: "India", timezone: "Asia/Kolkata" };
const KOLKATA = { name: "Eden Gardens", city: "Kolkata", country: "India", timezone: "Asia/Kolkata" };
const DALLAS = { name: "Grand Prairie Stadium", city: "Dallas", country: "USA", timezone: "America/Chicago" };

// ── Scorecard builders (compute derived numbers, keep authored data terse) ───

function bat(
  battingOrder: number,
  playerId: string,
  playerName: string,
  runs: number,
  balls: number,
  fours: number,
  sixes: number,
  dismissal: string,
  isOnStrike?: boolean,
): BattingEntry {
  return {
    battingOrder,
    playerId,
    playerName,
    runs,
    balls,
    fours,
    sixes,
    strikeRate: strikeRate(runs, balls),
    dismissal,
    isOut: dismissal !== "not out",
    ...(isOnStrike ? { isOnStrike } : {}),
  };
}

function bowl(
  playerId: string,
  playerName: string,
  oversText: string,
  maidens: number,
  runs: number,
  wickets: number,
  wides?: number,
  noballs?: number,
): BowlingEntry {
  const [o = "0", b = "0"] = oversText.split(".");
  const legalBalls = Number(o) * 6 + Number(b);
  return {
    playerId,
    playerName,
    oversText,
    legalBalls,
    maidens,
    runs,
    wickets,
    economy: legalBalls > 0 ? Math.round((runs / legalBalls) * 6 * 100) / 100 : null,
    ...(wides !== undefined ? { wides } : {}),
    ...(noballs !== undefined ? { noballs } : {}),
  };
}

function fow(wicket: number, runs: number, oversText: string, playerId: string, playerName: string): FallOfWicket {
  return { wicket, runs, oversText, playerId, playerName };
}

function extras(byes: number, legbyes: number, wides: number, noballs: number, penalty = 0): ExtrasBreakdown {
  return { byes, legbyes, wides, noballs, penalty, total: byes + legbyes + wides + noballs + penalty };
}

interface InningsInput {
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
  yetToBat?: { playerId: string; playerName: string }[];
}

function innings(input: InningsInput): InningsScorecard {
  return { ...input, yetToBat: input.yetToBat ?? [], runRate: runRate(input.runs, input.legalBalls) };
}

// ── The universe ─────────────────────────────────────────────────────────────

export function buildMockUniverse(now: Date): MockUniverse {
  const day = (offset: number) => dateKey(addDays(now, offset));
  /** ISO instant at a UTC wall-clock time, `offset` days from now. */
  const at = (offset: number, utcHour: number, utcMinute = 0) => {
    const d = addDays(now, offset);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), utcHour, utcMinute)).toISOString();
  };
  const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000).toISOString();

  const SERIES_ENG_IND: Series = {
    id: "ser-eng-ind-2026",
    name: "England tour of India, 2026",
    shortName: "ENG in IND",
    formats: ["T20"],
    startDate: day(-4),
    endDate: day(4),
    teamIds: [T.ind.id, T.eng.id],
  };
  const SERIES_MLC: Series = {
    id: "ser-mlc-2026",
    name: "Major League Cricket 2026",
    shortName: "MLC 2026",
    formats: ["T20"],
    startDate: day(-14),
    endDate: day(10),
    teamIds: [T.miny.id, T.tsk.id, T.seo.id, T.sfu.id, T.wsh.id, T.lakr.id],
  };

  // ═══ Match 3 — LIVE: IND 189/7 (20) v ENG 92/3 (11.2) at the Wankhede ═══

  const live: Fixture = {
    id: "eng-in-ind-2026-t20i-3",
    seriesId: SERIES_ENG_IND.id,
    seriesName: SERIES_ENG_IND.name,
    format: "T20",
    title: "3rd T20I",
    status: "live",
    statusText: "England need 98 off 52 balls",
    startTime: at(0, 13, 30), // 19:00 IST
    dateKey: day(0),
    venue: WANKHEDE,
    teams: { home: T.ind, away: T.eng },
    innings: [
      { number: 1, battingTeamId: T.ind.id, runs: 189, wickets: 7, oversText: "20", legalBalls: 120 },
      { number: 2, battingTeamId: T.eng.id, runs: 92, wickets: 3, oversText: "11.2", legalBalls: 68 },
    ],
    oversPerInnings: 20,
    battingTeamId: T.eng.id,
    lastBall: { innings: 2, over: 11, ball: 2 },
  };

  const liveDetail: MatchDetail = {
    ...live,
    toss: { winnerTeamId: T.eng.id, decision: "field" },
    officials: { umpires: ["Nitin Menon", "Michael Gough"], tvUmpire: "Richard Kettleborough", referee: "Andy Pycroft" },
    seriesStatusText: "Series level 1–1",
  };

  const liveScorecard: Scorecard = {
    matchId: live.id,
    innings: [
      innings({
        number: 1,
        battingTeamId: T.ind.id,
        bowlingTeamId: T.eng.id,
        runs: 189,
        wickets: 7,
        oversText: "20",
        legalBalls: 120,
        extras: extras(1, 3, 6, 1),
        batting: [
          bat(1, "p-rohit", "Rohit Sharma", 41, 28, 5, 1, "c Salt b Rashid"),
          bat(2, "p-jaiswal", "Yashasvi Jaiswal", 8, 6, 2, 0, "b Wood"),
          // 45 faced vs 120 legal balls — Kohli played the innings' lone no-ball.
          bat(3, "p-kohli", "Virat Kohli", 67, 45, 6, 3, "c Livingstone b Jordan"),
          bat(4, "p-sky", "Suryakumar Yadav", 34, 19, 3, 2, "c Jordan b Curran"),
          bat(5, "p-pant", "Rishabh Pant", 15, 12, 1, 0, "run out (Livingstone)"),
          bat(6, "p-hardik", "Hardik Pandya", 2, 2, 0, 0, "c Buttler b Jordan"),
          bat(7, "p-axar", "Axar Patel", 6, 5, 0, 0, "st Buttler b Rashid"),
          bat(8, "p-jadeja", "Ravindra Jadeja", 4, 3, 0, 0, "not out"),
          bat(9, "p-kuldeep", "Kuldeep Yadav", 1, 1, 0, 0, "not out"),
        ],
        bowling: [
          bowl("p-wood", "Mark Wood", "4", 0, 42, 1, 2, 1),
          bowl("p-curran", "Sam Curran", "4", 0, 38, 1, 1),
          bowl("p-jordan", "Chris Jordan", "4", 0, 39, 2, 2),
          bowl("p-rashid", "Adil Rashid", "4", 0, 27, 2, 0),
          bowl("p-livingstone", "Liam Livingstone", "2", 0, 19, 0, 0),
          bowl("p-archer", "Jofra Archer", "2", 0, 20, 0, 1),
        ],
        fallOfWickets: [
          fow(1, 14, "2.3", "p-jaiswal", "Yashasvi Jaiswal"),
          fow(2, 89, "10.2", "p-rohit", "Rohit Sharma"),
          fow(3, 131, "14.1", "p-sky", "Suryakumar Yadav"),
          fow(4, 155, "16.2", "p-hardik", "Hardik Pandya"),
          fow(5, 163, "17.1", "p-pant", "Rishabh Pant"),
          fow(6, 171, "18.2", "p-kohli", "Virat Kohli"),
          fow(7, 179, "19.1", "p-axar", "Axar Patel"),
        ],
        yetToBat: [
          { playerId: "p-bumrah", playerName: "Jasprit Bumrah" },
          { playerId: "p-arshdeep", playerName: "Arshdeep Singh" },
        ],
      }),
      innings({
        number: 2,
        battingTeamId: T.eng.id,
        bowlingTeamId: T.ind.id,
        runs: 92,
        wickets: 3,
        oversText: "11.2",
        legalBalls: 68,
        extras: extras(0, 2, 5, 0),
        batting: [
          bat(1, "p-salt", "Phil Salt", 18, 12, 3, 0, "c Jadeja b Bumrah"),
          bat(2, "p-buttler", "Jos Buttler", 43, 31, 4, 1, "not out", true),
          bat(3, "p-brook", "Harry Brook", 9, 12, 1, 0, "b Axar"),
          bat(4, "p-livingstone", "Liam Livingstone", 0, 3, 0, 0, "lbw b Kuldeep"),
          bat(5, "p-jacks", "Will Jacks", 15, 10, 2, 0, "not out"),
        ],
        bowling: [
          bowl("p-bumrah", "Jasprit Bumrah", "3", 0, 14, 1, 2),
          bowl("p-arshdeep", "Arshdeep Singh", "2", 0, 21, 0, 2),
          bowl("p-hardik", "Hardik Pandya", "1", 0, 11, 0, 0),
          bowl("p-axar", "Axar Patel", "3", 0, 26, 1, 0),
          bowl("p-kuldeep", "Kuldeep Yadav", "2.2", 0, 18, 1, 1),
        ],
        fallOfWickets: [
          fow(1, 25, "3.4", "p-salt", "Phil Salt"),
          fow(2, 50, "7.1", "p-brook", "Harry Brook"),
          fow(3, 68, "8.4", "p-livingstone", "Liam Livingstone"),
        ],
        yetToBat: [
          { playerId: "p-bethell", playerName: "Jacob Bethell" },
          { playerId: "p-curran", playerName: "Sam Curran" },
          { playerId: "p-jordan", playerName: "Chris Jordan" },
          { playerId: "p-archer", playerName: "Jofra Archer" },
          { playerId: "p-rashid", playerName: "Adil Rashid" },
          { playerId: "p-wood", playerName: "Mark Wood" },
        ],
      }),
    ],
  };

  /** Ball event shorthand for the live match. */
  const ev = (
    inningsNo: number,
    over: number,
    ball: number,
    bowlerId: string,
    batterId: string,
    nonStrikerId: string,
    batter: number,
    extrasRuns: number,
    commentaryText: string,
    ago: number,
    extra?: {
      extraType?: BallEvent["extraType"];
      wicket?: BallEvent["wicket"];
    },
  ): BallEvent => ({
    matchId: live.id,
    innings: inningsNo,
    over,
    ball,
    bowlerId,
    batterId,
    nonStrikerId,
    runs: { batter, extras: extrasRuns, total: batter + extrasRuns },
    commentaryText,
    timestamp: secondsAgo(ago),
    ...(extra?.extraType ? { extraType: extra.extraType } : {}),
    ...(extra?.wicket ? { wicket: extra.wicket } : {}),
  });

  const liveBalls: BallEvent[] = [
    // Innings 1 — the two CLAUDE.md reference deliveries (Shot Synthesizer fixtures).
    ev(
      1, 17, 4, "p-rashid", "p-axar", "p-kohli", 1, 0,
      "Adil Rashid to Axar Patel, 1 run, flatter on off stump, Axar goes on the back foot and cuts to the right of sweeper cover",
      100 * 60,
    ),
    ev(
      1, 19, 1, "p-rashid", "p-axar", "p-jadeja", 0, 0,
      "Adil Rashid to Axar Patel, WICKET! Deceives him with a googly. Axar charges down the track, beaten past the outside edge, and Buttler is lightning quick — whips off the bails. Stumped!",
      92 * 60,
      { wicket: { kind: "stumped", playerOutId: "p-axar", fielderIds: ["p-buttler"] } },
    ),
    // Innings 2 — overs 9 → 11.2, the live window.
    ev(2, 9, 1, "p-bumrah", "p-jacks", "p-buttler", 0, 0, "Bumrah to Jacks, no run, back of a length angling across, shouldered arms", 610),
    ev(2, 9, 2, "p-bumrah", "p-jacks", "p-buttler", 1, 0, "Bumrah to Jacks, 1 run, nudged into the leg side for a quick single", 570),
    ev(2, 9, 3, "p-bumrah", "p-buttler", "p-jacks", 4, 0, "Bumrah to Buttler, FOUR, strays onto the pads and Buttler clips it fine, one bounce into the rope", 530),
    ev(2, 9, 4, "p-bumrah", "p-buttler", "p-jacks", 0, 1, "Bumrah to Buttler, wide, follows him down the leg side", 500, { extraType: "wide" }),
    ev(2, 9, 4, "p-bumrah", "p-buttler", "p-jacks", 0, 0, "Bumrah to Buttler, no run, yorker on middle, dug out at the last moment", 470),
    ev(2, 9, 5, "p-bumrah", "p-buttler", "p-jacks", 1, 0, "Bumrah to Buttler, 1 run, low full toss squeezed out to deep point", 430),
    ev(2, 9, 6, "p-bumrah", "p-jacks", "p-buttler", 0, 0, "Bumrah to Jacks, no run, slower ball pushed back to the bowler", 390),
    ev(2, 10, 1, "p-axar", "p-buttler", "p-jacks", 1, 0, "Axar to Buttler, 1 run, flatter on middle, worked to deep midwicket", 350),
    ev(2, 10, 2, "p-axar", "p-jacks", "p-buttler", 4, 0, "Axar to Jacks, FOUR, short and wide, cut hard past backward point and it races away", 320),
    ev(2, 10, 3, "p-axar", "p-jacks", "p-buttler", 2, 0, "Axar to Jacks, 2 runs, swept to deep backward square leg, they come back for the second", 290),
    ev(2, 10, 4, "p-axar", "p-jacks", "p-buttler", 1, 0, "Axar to Jacks, 1 run, driven down to long-off", 260),
    ev(2, 10, 5, "p-axar", "p-buttler", "p-jacks", 1, 0, "Axar to Buttler, 1 run, tucked off the hip to short fine leg", 230),
    ev(2, 10, 6, "p-axar", "p-jacks", "p-buttler", 1, 0, "Axar to Jacks, 1 run, punched off the back foot to sweeper cover, keeps the strike", 200),
    ev(2, 11, 1, "p-kuldeep", "p-jacks", "p-buttler", 4, 0, "Kuldeep to Jacks, FOUR, Jacks dances down and lofts him over extra cover — one bounce into the boundary", 130),
    ev(2, 11, 2, "p-kuldeep", "p-jacks", "p-buttler", 0, 1, "Kuldeep to Jacks, wide, drifts down leg, the umpire stretches his arms", 80, { extraType: "wide" }),
    ev(2, 11, 2, "p-kuldeep", "p-jacks", "p-buttler", 1, 0, "Kuldeep to Jacks, 1 run, worked off the pads to deep square leg", 25),
  ];

  // ═══ Match 1 — completed (3 days ago): IND won by 24 runs ═══

  const m1: Fixture = {
    id: "eng-in-ind-2026-t20i-1",
    seriesId: SERIES_ENG_IND.id,
    seriesName: SERIES_ENG_IND.name,
    format: "T20",
    title: "1st T20I",
    status: "completed",
    statusText: "India won by 24 runs",
    startTime: at(-3, 13, 30),
    dateKey: day(-3),
    venue: AHMEDABAD,
    teams: { home: T.ind, away: T.eng },
    innings: [
      { number: 1, battingTeamId: T.ind.id, runs: 176, wickets: 6, oversText: "20", legalBalls: 120 },
      { number: 2, battingTeamId: T.eng.id, runs: 152, wickets: 10, oversText: "18.3", legalBalls: 111 },
    ],
    oversPerInnings: 20,
  };

  const m1Detail: MatchDetail = {
    ...m1,
    toss: { winnerTeamId: T.ind.id, decision: "bat" },
    resultText: "India won by 24 runs",
    officials: { umpires: ["Nitin Menon", "Chris Gaffaney"], referee: "Andy Pycroft" },
    seriesStatusText: "IND lead 1–0",
    playerOfMatchId: "p-bumrah",
    playerOfMatchName: "Jasprit Bumrah",
  };

  const m1Scorecard: Scorecard = {
    matchId: m1.id,
    innings: [
      innings({
        number: 1,
        battingTeamId: T.ind.id,
        bowlingTeamId: T.eng.id,
        runs: 176,
        wickets: 6,
        oversText: "20",
        legalBalls: 120,
        extras: extras(0, 2, 6, 1),
        batting: [
          bat(1, "p-rohit", "Rohit Sharma", 12, 10, 2, 0, "c Buttler b Archer"),
          // 39 faced vs 120 legal balls — Jaiswal played the innings' lone no-ball.
          bat(2, "p-jaiswal", "Yashasvi Jaiswal", 55, 39, 6, 2, "c Brook b Rashid"),
          bat(3, "p-kohli", "Virat Kohli", 29, 24, 3, 0, "lbw b Rashid"),
          bat(4, "p-sky", "Suryakumar Yadav", 38, 24, 4, 1, "c Livingstone b Wood"),
          bat(5, "p-pant", "Rishabh Pant", 16, 13, 1, 0, "st Buttler b Rashid"),
          bat(6, "p-hardik", "Hardik Pandya", 9, 6, 0, 1, "c Salt b Archer"),
          bat(7, "p-axar", "Axar Patel", 4, 3, 0, 0, "not out"),
          bat(8, "p-jadeja", "Ravindra Jadeja", 4, 2, 1, 0, "not out"),
        ],
        bowling: [
          bowl("p-archer", "Jofra Archer", "4", 0, 31, 2),
          bowl("p-wood", "Mark Wood", "4", 0, 35, 1),
          bowl("p-rashid", "Adil Rashid", "4", 0, 22, 3),
          bowl("p-curran", "Sam Curran", "4", 0, 39, 0),
          bowl("p-jordan", "Chris Jordan", "3", 0, 33, 0),
          bowl("p-livingstone", "Liam Livingstone", "1", 0, 14, 0),
        ],
        fallOfWickets: [
          fow(1, 18, "2.4", "p-rohit", "Rohit Sharma"),
          fow(2, 71, "8.5", "p-kohli", "Virat Kohli"),
          fow(3, 98, "11.3", "p-jaiswal", "Yashasvi Jaiswal"),
          fow(4, 134, "15.2", "p-pant", "Rishabh Pant"),
          fow(5, 160, "17.5", "p-sky", "Suryakumar Yadav"),
          fow(6, 170, "19.3", "p-hardik", "Hardik Pandya"),
        ],
        yetToBat: [
          { playerId: "p-kuldeep", playerName: "Kuldeep Yadav" },
          { playerId: "p-bumrah", playerName: "Jasprit Bumrah" },
          { playerId: "p-arshdeep", playerName: "Arshdeep Singh" },
        ],
      }),
      innings({
        number: 2,
        battingTeamId: T.eng.id,
        bowlingTeamId: T.ind.id,
        runs: 152,
        wickets: 10,
        oversText: "18.3",
        legalBalls: 111,
        extras: extras(0, 2, 4, 1),
        batting: [
          bat(1, "p-salt", "Phil Salt", 34, 21, 5, 1, "b Bumrah"),
          bat(2, "p-buttler", "Jos Buttler", 8, 9, 1, 0, "c Pant b Arshdeep"),
          // 30 faced vs 111 legal balls — Brook played the innings' lone no-ball.
          bat(3, "p-brook", "Harry Brook", 41, 30, 4, 2, "c Suryakumar b Kuldeep"),
          bat(4, "p-livingstone", "Liam Livingstone", 22, 17, 1, 2, "st Pant b Kuldeep"),
          bat(5, "p-jacks", "Will Jacks", 12, 10, 2, 0, "run out (Jadeja)"),
          bat(6, "p-bethell", "Jacob Bethell", 11, 9, 1, 0, "c Rohit b Axar"),
          bat(7, "p-curran", "Sam Curran", 10, 8, 1, 0, "b Bumrah"),
          bat(8, "p-jordan", "Chris Jordan", 4, 4, 0, 0, "c Kohli b Bumrah"),
          bat(9, "p-archer", "Jofra Archer", 2, 2, 0, 0, "lbw b Axar"),
          bat(10, "p-rashid", "Adil Rashid", 1, 1, 0, 0, "not out"),
          bat(11, "p-wood", "Mark Wood", 0, 1, 0, 0, "run out (Bumrah)"),
        ],
        bowling: [
          bowl("p-bumrah", "Jasprit Bumrah", "4", 0, 22, 3),
          bowl("p-arshdeep", "Arshdeep Singh", "3.3", 0, 31, 1),
          bowl("p-hardik", "Hardik Pandya", "2", 0, 19, 0),
          bowl("p-axar", "Axar Patel", "4", 0, 30, 2),
          bowl("p-kuldeep", "Kuldeep Yadav", "4", 0, 28, 2),
          bowl("p-jadeja", "Ravindra Jadeja", "1", 0, 20, 0),
        ],
        fallOfWickets: [
          fow(1, 39, "4.2", "p-salt", "Phil Salt"),
          fow(2, 55, "6.1", "p-buttler", "Jos Buttler"),
          fow(3, 98, "11.4", "p-brook", "Harry Brook"),
          fow(4, 112, "13.2", "p-livingstone", "Liam Livingstone"),
          fow(5, 124, "14.5", "p-jacks", "Will Jacks"),
          fow(6, 136, "16.1", "p-bethell", "Jacob Bethell"),
          fow(7, 146, "17.2", "p-curran", "Sam Curran"),
          fow(8, 150, "17.6", "p-jordan", "Chris Jordan"),
          fow(9, 151, "18.1", "p-archer", "Jofra Archer"),
          fow(10, 152, "18.3", "p-wood", "Mark Wood"),
        ],
      }),
    ],
  };

  // ═══ Match 2 — completed (yesterday): ENG won by 5 wickets ═══

  const m2: Fixture = {
    id: "eng-in-ind-2026-t20i-2",
    seriesId: SERIES_ENG_IND.id,
    seriesName: SERIES_ENG_IND.name,
    format: "T20",
    title: "2nd T20I",
    status: "completed",
    statusText: "England won by 5 wickets",
    startTime: at(-1, 13, 30),
    dateKey: day(-1),
    venue: DELHI,
    teams: { home: T.ind, away: T.eng },
    innings: [
      { number: 1, battingTeamId: T.ind.id, runs: 145, wickets: 8, oversText: "20", legalBalls: 120 },
      { number: 2, battingTeamId: T.eng.id, runs: 149, wickets: 5, oversText: "18.4", legalBalls: 112 },
    ],
    oversPerInnings: 20,
  };

  const m2Detail: MatchDetail = {
    ...m2,
    toss: { winnerTeamId: T.eng.id, decision: "field" },
    resultText: "England won by 5 wickets (8 balls remaining)",
    officials: { umpires: ["Michael Gough", "Anil Chaudhary"], referee: "Andy Pycroft" },
    seriesStatusText: "Series level 1–1",
    playerOfMatchId: "p-buttler",
    playerOfMatchName: "Jos Buttler",
  };

  const m2Scorecard: Scorecard = {
    matchId: m2.id,
    innings: [
      innings({
        number: 1,
        battingTeamId: T.ind.id,
        bowlingTeamId: T.eng.id,
        runs: 145,
        wickets: 8,
        oversText: "20",
        legalBalls: 120,
        extras: extras(0, 1, 4, 0),
        batting: [
          bat(1, "p-rohit", "Rohit Sharma", 3, 5, 0, 0, "c Buttler b Wood"),
          bat(2, "p-jaiswal", "Yashasvi Jaiswal", 28, 22, 4, 0, "c Jordan b Curran"),
          bat(3, "p-kohli", "Virat Kohli", 51, 39, 5, 1, "run out (Jacks)"),
          bat(4, "p-sky", "Suryakumar Yadav", 12, 11, 1, 0, "b Rashid"),
          bat(5, "p-pant", "Rishabh Pant", 19, 14, 2, 0, "c Curran b Rashid"),
          bat(6, "p-hardik", "Hardik Pandya", 11, 10, 0, 1, "c Salt b Archer"),
          bat(7, "p-axar", "Axar Patel", 7, 6, 1, 0, "b Archer"),
          bat(8, "p-jadeja", "Ravindra Jadeja", 6, 7, 0, 0, "not out"),
          bat(9, "p-kuldeep", "Kuldeep Yadav", 2, 3, 0, 0, "lbw b Rashid"),
          bat(10, "p-bumrah", "Jasprit Bumrah", 1, 3, 0, 0, "not out"),
        ],
        bowling: [
          bowl("p-wood", "Mark Wood", "4", 0, 25, 1),
          bowl("p-archer", "Jofra Archer", "4", 0, 27, 2),
          bowl("p-curran", "Sam Curran", "4", 0, 30, 1),
          bowl("p-rashid", "Adil Rashid", "4", 0, 24, 3),
          bowl("p-jordan", "Chris Jordan", "4", 0, 38, 0),
        ],
        fallOfWickets: [
          fow(1, 6, "1.2", "p-rohit", "Rohit Sharma"),
          fow(2, 52, "7.4", "p-jaiswal", "Yashasvi Jaiswal"),
          fow(3, 74, "10.5", "p-sky", "Suryakumar Yadav"),
          fow(4, 108, "14.3", "p-pant", "Rishabh Pant"),
          fow(5, 127, "16.5", "p-hardik", "Hardik Pandya"),
          fow(6, 138, "18.2", "p-axar", "Axar Patel"),
          fow(7, 141, "19.1", "p-kuldeep", "Kuldeep Yadav"),
          fow(8, 143, "19.4", "p-kohli", "Virat Kohli"),
        ],
        yetToBat: [{ playerId: "p-arshdeep", playerName: "Arshdeep Singh" }],
      }),
      innings({
        number: 2,
        battingTeamId: T.eng.id,
        bowlingTeamId: T.ind.id,
        runs: 149,
        wickets: 5,
        oversText: "18.4",
        legalBalls: 112,
        extras: extras(0, 1, 2, 0),
        batting: [
          bat(1, "p-salt", "Phil Salt", 22, 15, 4, 0, "c Axar b Bumrah"),
          bat(2, "p-buttler", "Jos Buttler", 61, 43, 6, 2, "c Rohit b Kuldeep"),
          bat(3, "p-brook", "Harry Brook", 27, 25, 2, 1, "b Jadeja"),
          bat(4, "p-livingstone", "Liam Livingstone", 15, 12, 1, 1, "c Jadeja b Axar"),
          bat(5, "p-jacks", "Will Jacks", 9, 8, 1, 0, "st Pant b Kuldeep"),
          bat(6, "p-bethell", "Jacob Bethell", 8, 6, 1, 0, "not out"),
          bat(7, "p-curran", "Sam Curran", 4, 3, 0, 0, "not out"),
        ],
        bowling: [
          bowl("p-bumrah", "Jasprit Bumrah", "4", 0, 20, 1),
          bowl("p-arshdeep", "Arshdeep Singh", "3", 0, 29, 0),
          bowl("p-axar", "Axar Patel", "4", 0, 30, 1),
          bowl("p-kuldeep", "Kuldeep Yadav", "4", 0, 31, 2),
          bowl("p-jadeja", "Ravindra Jadeja", "3.4", 0, 38, 1),
        ],
        fallOfWickets: [
          fow(1, 37, "4.3", "p-salt", "Phil Salt"),
          fow(2, 79, "10.2", "p-brook", "Harry Brook"),
          fow(3, 108, "13.4", "p-livingstone", "Liam Livingstone"),
          fow(4, 125, "15.5", "p-jacks", "Will Jacks"),
          fow(5, 139, "17.3", "p-buttler", "Jos Buttler"),
        ],
        yetToBat: [
          { playerId: "p-jordan", playerName: "Chris Jordan" },
          { playerId: "p-archer", playerName: "Jofra Archer" },
          { playerId: "p-rashid", playerName: "Adil Rashid" },
          { playerId: "p-wood", playerName: "Mark Wood" },
        ],
      }),
    ],
  };

  // ═══ Matches 4 & 5 — upcoming ═══

  const m4: Fixture = {
    id: "eng-in-ind-2026-t20i-4",
    seriesId: SERIES_ENG_IND.id,
    seriesName: SERIES_ENG_IND.name,
    format: "T20",
    title: "4th T20I",
    status: "upcoming",
    statusText: `Starts ${venueLocalTime(at(2, 13, 30), BENGALURU.timezone)}`,
    startTime: at(2, 13, 30),
    dateKey: day(2),
    venue: BENGALURU,
    teams: { home: T.ind, away: T.eng },
    innings: [],
    oversPerInnings: 20,
  };

  const m5: Fixture = {
    id: "eng-in-ind-2026-t20i-5",
    seriesId: SERIES_ENG_IND.id,
    seriesName: SERIES_ENG_IND.name,
    format: "T20",
    title: "5th T20I",
    status: "upcoming",
    statusText: `Starts ${venueLocalTime(at(4, 13, 30), KOLKATA.timezone)}`,
    startTime: at(4, 13, 30),
    dateKey: day(4),
    venue: KOLKATA,
    teams: { home: T.ind, away: T.eng },
    innings: [],
    oversPerInnings: 20,
  };

  // ═══ MLC fixtures ═══

  const mlc13: Fixture = {
    id: "mlc-2026-13",
    seriesId: SERIES_MLC.id,
    seriesName: SERIES_MLC.name,
    format: "T20",
    title: "Match 13",
    status: "upcoming",
    statusText: `Starts ${venueLocalTime(at(1, 0, 30), DALLAS.timezone)}`,
    startTime: at(1, 0, 30), // 19:30 CDT tonight, US time
    dateKey: day(0),
    venue: DALLAS,
    teams: { home: T.miny, away: T.tsk },
    innings: [],
    oversPerInnings: 20,
  };

  const mlc14: Fixture = {
    id: "mlc-2026-14",
    seriesId: SERIES_MLC.id,
    seriesName: SERIES_MLC.name,
    format: "T20",
    title: "Match 14",
    status: "upcoming",
    statusText: `Starts ${venueLocalTime(at(2, 0, 30), DALLAS.timezone)}`,
    startTime: at(2, 0, 30),
    dateKey: day(1),
    venue: DALLAS,
    teams: { home: T.seo, away: T.sfu },
    innings: [],
    oversPerInnings: 20,
  };

  // ═══ Squads (live series) ═══

  const engIndSquads: Squads = {
    matchId: live.id,
    teams: [
      {
        team: T.ind,
        players: [
          { id: "p-rohit", name: "Rohit Sharma", role: "batter", battingHand: "right", isCaptain: true, isPlaying: true },
          { id: "p-jaiswal", name: "Yashasvi Jaiswal", role: "batter", battingHand: "left", isPlaying: true },
          { id: "p-kohli", name: "Virat Kohli", role: "batter", battingHand: "right", isPlaying: true },
          { id: "p-sky", name: "Suryakumar Yadav", role: "batter", battingHand: "right", isPlaying: true },
          { id: "p-pant", name: "Rishabh Pant", role: "wicketkeeper", battingHand: "left", isKeeper: true, isPlaying: true },
          { id: "p-hardik", name: "Hardik Pandya", role: "allrounder", battingHand: "right", bowlingStyle: "Right-arm fast-medium", isPlaying: true },
          { id: "p-axar", name: "Axar Patel", role: "allrounder", battingHand: "left", bowlingStyle: "Slow left-arm orthodox", isPlaying: true },
          { id: "p-jadeja", name: "Ravindra Jadeja", role: "allrounder", battingHand: "left", bowlingStyle: "Slow left-arm orthodox", isPlaying: true },
          { id: "p-kuldeep", name: "Kuldeep Yadav", role: "bowler", battingHand: "left", bowlingStyle: "Left-arm wrist-spin", isPlaying: true },
          { id: "p-bumrah", name: "Jasprit Bumrah", role: "bowler", battingHand: "right", bowlingStyle: "Right-arm fast", isPlaying: true },
          { id: "p-arshdeep", name: "Arshdeep Singh", role: "bowler", battingHand: "left", bowlingStyle: "Left-arm fast-medium", isPlaying: true },
        ],
      },
      {
        team: T.eng,
        players: [
          { id: "p-salt", name: "Phil Salt", role: "batter", battingHand: "right", isPlaying: true },
          { id: "p-buttler", name: "Jos Buttler", role: "wicketkeeper", battingHand: "right", isCaptain: true, isKeeper: true, isPlaying: true },
          { id: "p-jacks", name: "Will Jacks", role: "allrounder", battingHand: "right", bowlingStyle: "Right-arm off-break", isPlaying: true },
          { id: "p-brook", name: "Harry Brook", role: "batter", battingHand: "right", isPlaying: true },
          { id: "p-livingstone", name: "Liam Livingstone", role: "allrounder", battingHand: "right", bowlingStyle: "Leg-break / off-break", isPlaying: true },
          { id: "p-bethell", name: "Jacob Bethell", role: "allrounder", battingHand: "left", bowlingStyle: "Slow left-arm orthodox", isPlaying: true },
          { id: "p-curran", name: "Sam Curran", role: "allrounder", battingHand: "left", bowlingStyle: "Left-arm fast-medium", isPlaying: true },
          { id: "p-jordan", name: "Chris Jordan", role: "bowler", battingHand: "right", bowlingStyle: "Right-arm fast-medium", isPlaying: true },
          { id: "p-archer", name: "Jofra Archer", role: "bowler", battingHand: "right", bowlingStyle: "Right-arm fast", isPlaying: true },
          { id: "p-rashid", name: "Adil Rashid", role: "bowler", battingHand: "right", bowlingStyle: "Leg-break googly", isPlaying: true },
          { id: "p-wood", name: "Mark Wood", role: "bowler", battingHand: "right", bowlingStyle: "Right-arm fast", isPlaying: true },
        ],
      },
    ],
  };

  // ═══ Player profiles (marquee subset — the rest resolve from squads) ═══

  const players: Record<string, PlayerProfile> = {
    "p-kohli": {
      id: "p-kohli", name: "Virat Kohli", countryCode: "IN", country: "India", role: "batter", battingHand: "right",
      born: "5 November 1988",
      batting: { T20: { matches: 125, runs: 4188, average: 48.7, strikeRate: 137.9, hundreds: 1, fifties: 38, highScore: "122*" }, ODI: { matches: 295, runs: 13906, average: 58.2, strikeRate: 93.5, hundreds: 50, fifties: 72, highScore: "183" } },
    },
    "p-rohit": {
      id: "p-rohit", name: "Rohit Sharma", countryCode: "IN", country: "India", role: "batter", battingHand: "right",
      born: "30 April 1987",
      batting: { T20: { matches: 159, runs: 4231, average: 32.1, strikeRate: 140.9, hundreds: 5, fifties: 32, highScore: "121*" } },
    },
    "p-buttler": {
      id: "p-buttler", name: "Jos Buttler", countryCode: "GB", country: "England", role: "wicketkeeper", battingHand: "right",
      born: "8 September 1990",
      batting: { T20: { matches: 124, runs: 3644, average: 35.4, strikeRate: 146.5, hundreds: 1, fifties: 27, highScore: "101*" } },
    },
    "p-rashid": {
      id: "p-rashid", name: "Adil Rashid", countryCode: "GB", country: "England", role: "bowler", battingHand: "right",
      bowlingStyle: "Leg-break googly", born: "17 February 1988",
      bowling: { T20: { matches: 114, wickets: 129, average: 22.9, economy: 7.4, bestFigures: "4/2" } },
    },
    "p-bumrah": {
      id: "p-bumrah", name: "Jasprit Bumrah", countryCode: "IN", country: "India", role: "bowler", battingHand: "right",
      bowlingStyle: "Right-arm fast", born: "6 December 1993",
      bowling: { T20: { matches: 70, wickets: 89, average: 18.7, economy: 6.3, bestFigures: "3/7" } },
    },
    "p-sky": {
      id: "p-sky", name: "Suryakumar Yadav", countryCode: "IN", country: "India", role: "batter", battingHand: "right",
      born: "14 September 1990",
      batting: { T20: { matches: 83, runs: 2602, average: 41.6, strikeRate: 167.1, hundreds: 4, fifties: 21, highScore: "117" } },
    },
    "p-pant": {
      id: "p-pant", name: "Rishabh Pant", countryCode: "IN", country: "India", role: "wicketkeeper", battingHand: "left",
      born: "4 October 1997",
      batting: { T20: { matches: 76, runs: 1209, average: 23.3, strikeRate: 127.3, hundreds: 0, fifties: 3, highScore: "65*" } },
    },
    "p-salt": {
      id: "p-salt", name: "Phil Salt", countryCode: "GB", country: "England", role: "batter", battingHand: "right",
      born: "28 August 1996",
      batting: { T20: { matches: 71, runs: 2001, average: 31.3, strikeRate: 162.5, hundreds: 2, fifties: 11, highScore: "119" } },
    },
  };

  // ═══ MLC points table ═══

  const mlcPointsTable: PointsTable = {
    seriesId: SERIES_MLC.id,
    groups: [
      {
        rows: [
          { teamId: T.miny.id, teamName: T.miny.name, teamShortName: T.miny.shortName, played: 5, won: 4, lost: 1, tied: 0, noResult: 0, points: 8, netRunRate: 1.24 },
          { teamId: T.tsk.id, teamName: T.tsk.name, teamShortName: T.tsk.shortName, played: 5, won: 3, lost: 2, tied: 0, noResult: 0, points: 6, netRunRate: 0.62 },
          { teamId: T.wsh.id, teamName: T.wsh.name, teamShortName: T.wsh.shortName, played: 4, won: 3, lost: 1, tied: 0, noResult: 0, points: 6, netRunRate: 0.41 },
          { teamId: T.sfu.id, teamName: T.sfu.name, teamShortName: T.sfu.shortName, played: 5, won: 2, lost: 3, tied: 0, noResult: 0, points: 4, netRunRate: -0.18 },
          { teamId: T.seo.id, teamName: T.seo.name, teamShortName: T.seo.shortName, played: 4, won: 1, lost: 3, tied: 0, noResult: 0, points: 2, netRunRate: -0.73 },
          { teamId: T.lakr.id, teamName: T.lakr.name, teamShortName: T.lakr.shortName, played: 5, won: 1, lost: 4, tied: 0, noResult: 0, points: 2, netRunRate: -1.29 },
        ],
      },
    ],
  };

  // ═══ Assemble ═══

  const fixtures = [m1, m2, live, m4, m5, mlc13, mlc14];

  const details: Record<string, MatchDetail> = {
    [live.id]: liveDetail,
    [m1.id]: m1Detail,
    [m2.id]: m2Detail,
    [m4.id]: { ...m4 },
    [m5.id]: { ...m5 },
    [mlc13.id]: { ...mlc13 },
    [mlc14.id]: { ...mlc14 },
  };

  const scorecards: Record<string, Scorecard> = {
    [live.id]: liveScorecard,
    [m1.id]: m1Scorecard,
    [m2.id]: m2Scorecard,
    [m4.id]: { matchId: m4.id, innings: [] },
    [m5.id]: { matchId: m5.id, innings: [] },
    [mlc13.id]: { matchId: mlc13.id, innings: [] },
    [mlc14.id]: { matchId: mlc14.id, innings: [] },
  };

  const squads: Record<string, Squads> = {
    [live.id]: engIndSquads,
    [m1.id]: { ...engIndSquads, matchId: m1.id },
    [m2.id]: { ...engIndSquads, matchId: m2.id },
    [m4.id]: { ...engIndSquads, matchId: m4.id },
    [m5.id]: { ...engIndSquads, matchId: m5.id },
    [mlc13.id]: { matchId: mlc13.id, teams: [{ team: T.miny, players: [] }, { team: T.tsk, players: [] }] },
    [mlc14.id]: { matchId: mlc14.id, teams: [{ team: T.seo, players: [] }, { team: T.sfu, players: [] }] },
  };

  return {
    fixtures,
    details,
    scorecards,
    balls: { [live.id]: liveBalls },
    squads,
    players,
    series: [SERIES_ENG_IND, SERIES_MLC],
    pointsTables: { [SERIES_MLC.id]: mlcPointsTable, [SERIES_ENG_IND.id]: { seriesId: SERIES_ENG_IND.id, groups: [] } },
  };
}
