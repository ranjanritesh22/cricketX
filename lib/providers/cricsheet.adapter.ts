/**
 * Cricsheet adapter — historical JSON replays (dev/test/demo mode).
 *
 * First-class, not a hack (CLAUDE.md §3.1): this is how the live pipeline and
 * the 3D engine get developed without burning API quota, and it becomes the
 * user-facing "Match Replay" feature in Phase 2 (`?replay=<match-id>&speed=8x`).
 *
 * Reads a directory of Cricsheet match JSON files (ODC-BY licensed —
 * attributed in the footer) and aggregates raw deliveries into canonical
 * scorecards and BallEvents.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { formatOvers } from "@/lib/format";
import { MatchNotFoundError, PlayerNotFoundError, ProviderNotConfiguredError, ProviderResponseError } from "./errors";
import { cricsheetMatchSchema, type CricsheetDelivery, type CricsheetMatch } from "./cricsheet.schema";
import type { CricketDataProvider } from "./provider.interface";
import type {
  BallEvent,
  BallRef,
  BattingEntry,
  BowlingEntry,
  Fixture,
  InningsScorecard,
  InningsSummary,
  MatchDetail,
  PlayerProfile,
  PointsTable,
  Scorecard,
  Series,
  Squads,
  WicketKind,
  TeamRef,
} from "./types";
import { isAfterBall, slugify, teamRefFromName, toMatchFormat } from "./util";

const PROVIDER = "cricsheet";

export interface CricsheetAdapterOptions {
  /** Directory containing Cricsheet *.json match files. */
  dir?: string;
}

export class CricsheetAdapter implements CricketDataProvider {
  private readonly dir: string;
  private cache: Map<string, CricsheetMatch> | null = null;

  constructor(options: CricsheetAdapterOptions = {}) {
    this.dir = options.dir ?? process.env.CRICSHEET_DIR ?? "data/cricsheet";
  }

  private async load(): Promise<Map<string, CricsheetMatch>> {
    if (this.cache) return this.cache;
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      throw new ProviderNotConfiguredError(
        PROVIDER,
        `Directory "${this.dir}" is missing. Drop Cricsheet match JSON files there (https://cricsheet.org, ODC-BY) or set CRICSHEET_DIR.`,
      );
    }
    const cache = new Map<string, CricsheetMatch>();
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const raw = await readFile(path.join(this.dir, file), "utf8");
      const parsed = cricsheetMatchSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        throw new ProviderResponseError(PROVIDER, `"${file}" is not valid Cricsheet JSON`, parsed.error.issues);
      }
      cache.set(file.replace(/\.json$/, ""), parsed.data);
    }
    this.cache = cache;
    return cache;
  }

  private async match(matchId: string): Promise<CricsheetMatch> {
    const match = (await this.load()).get(matchId);
    if (!match) throw new MatchNotFoundError(PROVIDER, matchId);
    return match;
  }

  async getFixtures(date: string): Promise<Fixture[]> {
    const all = await this.load();
    const fixtures: Fixture[] = [];
    for (const [id, match] of all) {
      if (match.info.dates.includes(date)) fixtures.push(toFixture(id, match));
    }
    return fixtures.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  async getSeries(): Promise<Series[]> {
    const all = await this.load();
    const byId = new Map<string, Series>();
    for (const [, match] of all) {
      const { id, name } = seriesOf(match);
      const dates = [...match.info.dates].sort();
      const existing = byId.get(id);
      const format = toMatchFormat(match.info.match_type, match.info.overs);
      if (!existing) {
        byId.set(id, {
          id,
          name,
          formats: [format],
          ...(dates[0] ? { startDate: dates[0] } : {}),
          ...(dates.at(-1) ? { endDate: dates.at(-1) } : {}),
        });
      } else {
        if (!existing.formats.includes(format)) existing.formats.push(format);
        if (dates[0] && (!existing.startDate || dates[0] < existing.startDate)) existing.startDate = dates[0];
        const last = dates.at(-1);
        if (last && (!existing.endDate || last > existing.endDate)) existing.endDate = last;
      }
    }
    return [...byId.values()].sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  }

  async getMatch(matchId: string): Promise<MatchDetail> {
    const match = await this.match(matchId);
    const fixture = toFixture(matchId, match);
    const info = match.info;
    const tossWinner = info.toss ? teamRefFromName(info.toss.winner) : undefined;
    const officials = info.officials;
    const potmName = info.player_of_match?.[0];
    return {
      ...fixture,
      ...(info.toss && tossWinner
        ? { toss: { winnerTeamId: tossWinner.id, decision: info.toss.decision === "bat" ? "bat" : "field" } }
        : {}),
      resultText: fixture.statusText,
      ...(officials
        ? {
            officials: {
              ...(officials.umpires ? { umpires: officials.umpires } : {}),
              ...(officials.tv_umpires?.[0] ? { tvUmpire: officials.tv_umpires[0] } : {}),
              ...(officials.match_referees?.[0] ? { referee: officials.match_referees[0] } : {}),
            },
          }
        : {}),
      ...(potmName
        ? { playerOfMatchId: playerId(match, potmName), playerOfMatchName: potmName }
        : {}),
    };
  }

  async getScorecard(matchId: string): Promise<Scorecard> {
    const match = await this.match(matchId);
    return {
      matchId,
      innings: match.innings
        .filter((inn) => !inn.forfeited && !inn.super_over)
        .map((_, idx) => buildInnings(match, idx)),
    };
  }

  async getBallByBall(matchId: string, sinceBall?: BallRef): Promise<BallEvent[]> {
    const match = await this.match(matchId);
    const events = flattenBalls(matchId, match);
    return sinceBall ? events.filter((e) => isAfterBall(e, sinceBall)) : events;
  }

  async getSquads(matchId: string): Promise<Squads> {
    const match = await this.match(matchId);
    return {
      matchId,
      teams: match.info.teams.map((teamName) => ({
        team: teamRefFromName(teamName),
        players: (match.info.players[teamName] ?? []).map((name) => ({
          id: playerId(match, name),
          name,
          isPlaying: true,
        })),
      })),
    };
  }

  async getPlayer(playerIdArg: string): Promise<PlayerProfile> {
    const all = await this.load();
    for (const [, match] of all) {
      for (const [name, id] of Object.entries(match.info.registry.people)) {
        if (id === playerIdArg || slugify(name) === playerIdArg) {
          return { id: playerIdArg, name };
        }
      }
    }
    throw new PlayerNotFoundError(PROVIDER, playerIdArg);
  }

  async getPointsTable(seriesId: string): Promise<PointsTable> {
    // Standings are not derivable from individual match files without the full
    // tournament set + tie-break rules; honest empty table (CLAUDE.md §4 spirit).
    return { seriesId, groups: [] };
  }
}

// ── Mapping internals ────────────────────────────────────────────────────────

function playerId(match: CricsheetMatch, name: string): string {
  return match.info.registry.people[name] ?? slugify(name);
}

function seriesOf(match: CricsheetMatch): { id: string; name: string } {
  const eventName = match.info.event?.name;
  const season = match.info.season !== undefined ? String(match.info.season) : undefined;
  if (!eventName) {
    const name = season ? `Other matches, ${season}` : "Other matches";
    return { id: `cs-${slugify(name)}`, name };
  }
  const name = season && !eventName.includes(season) ? `${eventName} ${season}` : eventName;
  return { id: `cs-${slugify(name)}`, name };
}

function resultText(match: CricsheetMatch): string {
  const { outcome } = match.info;
  if (outcome.winner) {
    const by = outcome.by;
    const method = outcome.method ? ` (${outcome.method})` : "";
    if (by?.runs !== undefined) return `${outcome.winner} won by ${by.runs} run${by.runs === 1 ? "" : "s"}${method}`;
    if (by?.wickets !== undefined) return `${outcome.winner} won by ${by.wickets} wicket${by.wickets === 1 ? "" : "s"}${method}`;
    if (by?.innings !== undefined) return `${outcome.winner} won by an innings${method}`;
    if (outcome.eliminator === outcome.winner || outcome.bowl_out === outcome.winner)
      return `${outcome.winner} won the tie-breaker`;
    return `${outcome.winner} won${method}`;
  }
  if (outcome.result === "tie") return "Match tied";
  if (outcome.result === "draw") return "Match drawn";
  return "No result";
}

interface InningsTally {
  summary: InningsSummary;
}

function tallyInnings(match: CricsheetMatch, idx: number): InningsTally {
  const inn = match.innings[idx];
  if (!inn) throw new ProviderResponseError(PROVIDER, `Innings ${idx} out of range`);
  const battingTeam = teamRefFromName(inn.team);
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  for (const over of inn.overs ?? []) {
    for (const d of over.deliveries) {
      runs += d.runs.total;
      wickets += d.wickets?.length ?? 0;
      if (!isWide(d) && !isNoball(d)) legalBalls += 1;
    }
  }
  return {
    summary: {
      number: idx + 1,
      battingTeamId: battingTeam.id,
      runs,
      wickets,
      oversText: formatOvers(legalBalls),
      legalBalls,
      ...(inn.declared ? { declared: true } : {}),
    },
  };
}

function toFixture(matchId: string, match: CricsheetMatch): Fixture {
  const info = match.info;
  const teams = info.teams.map(teamRefFromName);
  const home = teams[0];
  const away = teams[1];
  if (!home || !away) throw new ProviderResponseError(PROVIDER, `Match ${matchId} is missing teams`);
  const series = seriesOf(match);
  const firstDate = info.dates[0] ?? "1970-01-01";
  const innings = match.innings
    .filter((inn) => !inn.forfeited && !inn.super_over)
    .map((_, idx) => tallyInnings(match, idx).summary);
  return {
    id: matchId,
    seriesId: series.id,
    seriesName: series.name,
    format: toMatchFormat(info.match_type, info.overs),
    ...(info.event?.match_number !== undefined ? { title: `Match ${info.event.match_number}` } : {}),
    status: "completed",
    statusText: resultText(match),
    startTime: `${firstDate}T00:00:00.000Z`,
    dateKey: firstDate,
    venue: {
      name: info.venue ?? "Unknown venue",
      ...(info.city ? { city: info.city } : {}),
    },
    teams: { home, away },
    innings,
    ...(info.overs ? { oversPerInnings: info.overs } : {}),
  };
}

function isWide(d: CricsheetDelivery): boolean {
  return d.extras?.wides !== undefined;
}
function isNoball(d: CricsheetDelivery): boolean {
  return d.extras?.noballs !== undefined;
}

const BOWLER_CREDITED: ReadonlySet<string> = new Set([
  "bowled",
  "caught",
  "caught and bowled",
  "lbw",
  "stumped",
  "hit wicket",
]);

function dismissalText(d: CricsheetDelivery, wicket: NonNullable<CricsheetDelivery["wickets"]>[number]): string {
  const fielder = wicket.fielders?.[0];
  const fielderName = fielder ? (fielder.substitute ? "sub" : (fielder.name ?? "sub")) : undefined;
  switch (wicket.kind) {
    case "bowled":
      return `b ${d.bowler}`;
    case "caught":
      return fielderName === d.bowler ? `c & b ${d.bowler}` : `c ${fielderName ?? "sub"} b ${d.bowler}`;
    case "caught and bowled":
      return `c & b ${d.bowler}`;
    case "lbw":
      return `lbw b ${d.bowler}`;
    case "stumped":
      return `st ${fielderName ?? "sub"} b ${d.bowler}`;
    case "hit wicket":
      return `hit wicket b ${d.bowler}`;
    case "run out":
      return fielderName ? `run out (${fielderName})` : "run out";
    default:
      return wicket.kind;
  }
}

function buildInnings(match: CricsheetMatch, idx: number): InningsScorecard {
  const inn = match.innings[idx];
  if (!inn) throw new ProviderResponseError(PROVIDER, `Innings ${idx} out of range`);
  const battingTeamName = inn.team;
  const bowlingTeamName = match.info.teams.find((t) => t !== battingTeamName) ?? battingTeamName;
  const battingTeam = teamRefFromName(battingTeamName);
  const bowlingTeam = teamRefFromName(bowlingTeamName);

  const batters = new Map<string, BattingEntry>();
  const bowlers = new Map<string, BowlingEntry & { conceded: number }>();
  const fallOfWickets: InningsScorecard["fallOfWickets"] = [];
  const extras = { byes: 0, legbyes: 0, wides: 0, noballs: 0, penalty: 0, total: 0 };
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;

  const batterEntry = (name: string): BattingEntry => {
    let entry = batters.get(name);
    if (!entry) {
      entry = {
        playerId: playerId(match, name),
        playerName: name,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strikeRate: null,
        dismissal: "not out",
        isOut: false,
        battingOrder: batters.size + 1,
      };
      batters.set(name, entry);
    }
    return entry;
  };

  const bowlerEntry = (name: string) => {
    let entry = bowlers.get(name);
    if (!entry) {
      entry = {
        playerId: playerId(match, name),
        playerName: name,
        oversText: "0",
        legalBalls: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        economy: null,
        conceded: 0,
      };
      bowlers.set(name, entry);
    }
    return entry;
  };

  for (const over of inn.overs ?? []) {
    let legalInOver = 0;
    let concededInOver = 0;
    let overBowler: string | null = null;
    for (const d of over.deliveries) {
      overBowler = d.bowler;
      const striker = batterEntry(d.batter);
      batterEntry(d.non_striker); // registers arrival order for openers/new batters
      const bowler = bowlerEntry(d.bowler);
      const wide = isWide(d);
      const noball = isNoball(d);

      runs += d.runs.total;
      extras.byes += d.extras?.byes ?? 0;
      extras.legbyes += d.extras?.legbyes ?? 0;
      extras.wides += d.extras?.wides ?? 0;
      extras.noballs += d.extras?.noballs ?? 0;
      extras.penalty += d.extras?.penalty ?? 0;

      striker.runs += d.runs.batter;
      if (!wide) striker.balls += 1;
      if (d.runs.batter === 4 && !d.runs.non_boundary) striker.fours += 1;
      if (d.runs.batter === 6 && !d.runs.non_boundary) striker.sixes += 1;

      const conceded = d.runs.total - (d.extras?.byes ?? 0) - (d.extras?.legbyes ?? 0) - (d.extras?.penalty ?? 0);
      bowler.conceded += conceded;
      concededInOver += conceded;
      if (!wide && !noball) {
        bowler.legalBalls += 1;
        legalBalls += 1;
        legalInOver += 1;
      }

      for (const w of d.wickets ?? []) {
        wickets += 1;
        const out = batterEntry(w.player_out);
        out.isOut = true;
        out.dismissal = dismissalText(d, w);
        if (BOWLER_CREDITED.has(w.kind)) bowler.wickets += 1;
        fallOfWickets.push({
          wicket: wickets,
          runs,
          oversText: `${over.over}.${Math.max(legalInOver, 1)}`,
          playerId: out.playerId,
          playerName: w.player_out,
        });
      }
    }
    if (overBowler && legalInOver >= match.info.balls_per_over && concededInOver === 0) {
      bowlerEntry(overBowler).maidens += 1;
    }
  }

  extras.total = extras.byes + extras.legbyes + extras.wides + extras.noballs + extras.penalty;

  const batting = [...batters.values()]
    .filter((b) => b.balls > 0 || b.isOut || b.runs > 0)
    .map((b) => ({ ...b, strikeRate: b.balls > 0 ? Math.round((b.runs / b.balls) * 100 * 100) / 100 : null }))
    .sort((a, b) => a.battingOrder - b.battingOrder);

  const atCrease = new Set(batting.map((b) => b.playerName));
  const yetToBat = (match.info.players[battingTeamName] ?? [])
    .filter((name) => !atCrease.has(name))
    .map((name) => ({ playerId: playerId(match, name), playerName: name }));

  const bowling = [...bowlers.values()].map(({ conceded, ...b }) => ({
    ...b,
    runs: conceded,
    oversText: formatOvers(b.legalBalls),
    economy: b.legalBalls > 0 ? Math.round((conceded / b.legalBalls) * 6 * 100) / 100 : null,
  }));

  return {
    number: idx + 1,
    battingTeamId: battingTeam.id,
    bowlingTeamId: bowlingTeam.id,
    runs,
    wickets,
    oversText: formatOvers(legalBalls),
    legalBalls,
    extras,
    batting,
    bowling,
    fallOfWickets,
    yetToBat,
    runRate: legalBalls > 0 ? Math.round((runs / legalBalls) * 6 * 100) / 100 : null,
    ...(inn.declared ? { isDeclared: true } : {}),
  };
}

/** Generated, honest commentary — Cricsheet has no prose. Real live text comes
 *  from live providers; the synthesizer treats this as low-signal input. */
function describeDelivery(d: CricsheetDelivery): string {
  const wicket = d.wickets?.[0];
  if (wicket) return `OUT! ${wicket.player_out} ${dismissalText(d, wicket)}`;
  if (isWide(d)) return d.runs.total > 1 ? `${d.runs.total} wides` : "wide";
  if (isNoball(d)) return `no ball${d.runs.batter ? `, ${d.runs.batter} run${d.runs.batter === 1 ? "" : "s"}` : ""}`;
  if (d.extras?.byes) return `${d.extras.byes} bye${d.extras.byes === 1 ? "" : "s"}`;
  if (d.extras?.legbyes) return `${d.extras.legbyes} leg bye${d.extras.legbyes === 1 ? "" : "s"}`;
  if (d.runs.batter === 0) return "no run";
  if (d.runs.batter === 4 && !d.runs.non_boundary) return "FOUR";
  if (d.runs.batter === 6 && !d.runs.non_boundary) return "SIX";
  return `${d.runs.batter} run${d.runs.batter === 1 ? "" : "s"}`;
}

function flattenBalls(matchId: string, match: CricsheetMatch): BallEvent[] {
  const events: BallEvent[] = [];
  const baseTime = new Date(`${match.info.dates[0] ?? "1970-01-01"}T09:00:00.000Z`).getTime();
  let seq = 0;
  match.innings.forEach((inn, idx) => {
    if (inn.forfeited || inn.super_over) return;
    for (const over of inn.overs ?? []) {
      let legalInOver = 0;
      for (const d of over.deliveries) {
        const wide = isWide(d);
        const noball = isNoball(d);
        // Broadcast convention: a wide/noball shares the number of the legal
        // ball it precedes ("17.4" wide, then "17.4" again).
        const ballNum = legalInOver + 1;
        const wicket = d.wickets?.[0];
        const extraType = wide
          ? ("wide" as const)
          : noball
            ? ("noball" as const)
            : d.extras?.byes
              ? ("bye" as const)
              : d.extras?.legbyes
                ? ("legbye" as const)
                : d.extras?.penalty
                  ? ("penalty" as const)
                  : undefined;
        events.push({
          matchId,
          innings: idx + 1,
          over: over.over,
          ball: ballNum,
          bowlerId: playerId(match, d.bowler),
          batterId: playerId(match, d.batter),
          nonStrikerId: playerId(match, d.non_striker),
          runs: { batter: d.runs.batter, extras: d.runs.extras, total: d.runs.total },
          ...(extraType ? { extraType } : {}),
          ...(wicket
            ? {
                wicket: {
                  kind: wicket.kind as WicketKind,
                  playerOutId: playerId(match, wicket.player_out),
                  fielderIds: (wicket.fielders ?? [])
                    .map((f) => (f.name ? playerId(match, f.name) : null))
                    .filter((id): id is string => id !== null),
                },
              }
            : {}),
          commentaryText: `${d.bowler} to ${d.batter}, ${describeDelivery(d)}`,
          timestamp: new Date(baseTime + seq * 40_000).toISOString(),
        });
        seq += 1;
        if (!wide && !noball) legalInOver += 1;
      }
    }
  });
  return events;
}

export type { TeamRef };
