/**
 * cricketdata.org adapter (api.cricapi.com/v1) — MVP live data.
 *
 * Free tier is 100 requests/day: responses are TTL-cached in-process, and the
 * Phase 2 poller is the ONLY thing that should call live endpoints frequently
 * — clients always go through our server (CLAUDE.md §2.3).
 */
import { formatOvers } from "@/lib/format";
import { MatchNotFoundError, PlayerNotFoundError, ProviderNotConfiguredError, ProviderResponseError } from "./errors";
import {
  apiBallByBallSchema,
  apiMatchListSchema,
  apiMatchSchema,
  apiPlayerInfoSchema,
  apiScorecardSchema,
  apiSeriesListSchema,
  apiSeriesPointsSchema,
  apiSquadSchema,
  envelopeSchema,
} from "./cricketdata.schema";
import type { CricketDataProvider } from "./provider.interface";
import type {
  BallEvent,
  BallRef,
  BattingHand,
  Fixture,
  InningsSummary,
  MatchDetail,
  MatchFormat,
  MatchStatus,
  PlayerProfile,
  PlayerRole,
  PointsTable,
  Scorecard,
  Series,
  Squads,
  TeamRef,
  WicketKind,
} from "./types";
import { isAfterBall, slugify, teamRefFromName, toMatchFormat } from "./util";
import type { z } from "zod";

const PROVIDER = "cricketdata";
const BASE_URL = "https://api.cricapi.com/v1";

type ApiMatch = z.infer<typeof apiMatchSchema>;

interface CacheEntry {
  expires: number;
  value: unknown;
}

export interface CricketDataAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class CricketDataAdapter implements CricketDataProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: CricketDataAdapterOptions = {}) {
    const apiKey = options.apiKey ?? process.env.CRICKETDATA_API_KEY;
    if (!apiKey) {
      throw new ProviderNotConfiguredError(
        PROVIDER,
        "Set CRICKETDATA_API_KEY (free key at https://cricketdata.org) or use DATA_PROVIDER=mock.",
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private async call<T>(
    endpoint: string,
    params: Record<string, string>,
    schema: { parse: (data: unknown) => T },
    ttlMs: number,
  ): Promise<T> {
    const search = new URLSearchParams({ apikey: this.apiKey, ...params });
    const cacheKey = `${endpoint}?${new URLSearchParams(params).toString()}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > this.now()) return hit.value as T;

    const res = await this.fetchImpl(`${this.baseUrl}/${endpoint}?${search.toString()}`);
    if (!res.ok) {
      throw new ProviderResponseError(PROVIDER, `${endpoint} responded ${res.status}`);
    }
    const envelope = envelopeSchema.parse(await res.json());
    if (envelope.status !== "success" || envelope.data === undefined) {
      throw new ProviderResponseError(PROVIDER, envelope.reason ?? `${endpoint} returned status "${envelope.status}"`);
    }
    let data: T;
    try {
      data = schema.parse(envelope.data);
    } catch (err) {
      throw new ProviderResponseError(PROVIDER, `${endpoint} payload failed validation`, err);
    }
    this.cache.set(cacheKey, { expires: this.now() + ttlMs, value: data });
    return data;
  }

  async getFixtures(date: string): Promise<Fixture[]> {
    // /currentMatches carries live scores; /matches carries the schedule.
    // One page of each per 5-minute window keeps free-tier budgets intact.
    const [current, scheduled] = await Promise.all([
      this.call("currentMatches", { offset: "0" }, apiMatchListSchema, 5 * 60_000),
      this.call("matches", { offset: "0" }, apiMatchListSchema, 5 * 60_000),
    ]);
    const byId = new Map<string, ApiMatch>();
    for (const m of [...scheduled, ...current]) byId.set(m.id, m);
    return [...byId.values()]
      .filter((m) => (m.date ?? m.dateTimeGMT ?? "").slice(0, 10) === date)
      .map((m) => toFixture(m))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  async getSeries(): Promise<Series[]> {
    const list = await this.call("series", { offset: "0" }, apiSeriesListSchema, 30 * 60_000);
    return list.map((s) => {
      const formats: MatchFormat[] = [];
      if (s.t20) formats.push("T20");
      if (s.odi) formats.push("ODI");
      if (s.test) formats.push("TEST");
      return {
        id: s.id,
        name: s.name,
        formats: formats.length ? formats : ["T20"],
        ...(s.startDate ? { startDate: s.startDate.slice(0, 10) } : {}),
        ...(s.endDate ? { endDate: normalizeEndDate(s.endDate, s.startDate) } : {}),
      };
    });
  }

  async getMatch(matchId: string): Promise<MatchDetail> {
    const m = await this.call("match_info", { id: matchId }, apiMatchSchema, 60_000);
    if (!m.id) throw new MatchNotFoundError(PROVIDER, matchId);
    const fixture = toFixture(m);
    const tossWinnerTeam = m.tossWinner
      ? [fixture.teams.home, fixture.teams.away].find((t) => t.name === m.tossWinner)
      : undefined;
    return {
      ...fixture,
      ...(tossWinnerTeam && m.tossChoice
        ? { toss: { winnerTeamId: tossWinnerTeam.id, decision: m.tossChoice.toLowerCase().startsWith("bat") ? "bat" : "field" } }
        : {}),
      ...(fixture.status === "completed" ? { resultText: fixture.statusText } : {}),
    };
  }

  async getScorecard(matchId: string): Promise<Scorecard> {
    const data = await this.call("match_scorecard", { id: matchId }, apiScorecardSchema, 30_000);
    const teams = (data.teams ?? []).map((name) => teamRefFromName(name));
    const inningsTeam = (inningLabel: string | undefined): { batting: TeamRef; bowling: TeamRef } => {
      const batting = teams.find((t) => inningLabel?.toLowerCase().startsWith(t.name.toLowerCase()));
      const bowling = teams.find((t) => t.id !== batting?.id);
      return {
        batting: batting ?? teams[0] ?? teamRefFromName("Team A"),
        bowling: bowling ?? teams[1] ?? teamRefFromName("Team B"),
      };
    };
    const score = data.score ?? [];
    return {
      matchId,
      innings: (data.scorecard ?? []).map((inn, idx) => {
        const { batting, bowling } = inningsTeam(inn.inning);
        const summary = score[idx];
        const legalBalls = oversFloatToBalls(summary?.o ?? 0);
        const batters = (inn.batting ?? []).map((b, order) => {
          const runs = b.r ?? 0;
          const balls = b.b ?? 0;
          const dismissal = normalizeDismissal(b["dismissal-text"]);
          return {
            playerId: b.batsman?.id ?? slugify(b.batsman?.name ?? `batter-${order}`),
            playerName: b.batsman?.name ?? "Unknown",
            runs,
            balls,
            fours: b["4s"] ?? 0,
            sixes: b["6s"] ?? 0,
            strikeRate: b.sr ?? (balls > 0 ? Math.round((runs / balls) * 100 * 100) / 100 : null),
            dismissal,
            isOut: dismissal !== "not out",
            battingOrder: order + 1,
          };
        });
        const extrasRuns = inn.extras?.r ?? 0;
        return {
          number: idx + 1,
          battingTeamId: batting.id,
          bowlingTeamId: bowling.id,
          runs: summary?.r ?? batters.reduce((sum, b) => sum + b.runs, 0) + extrasRuns,
          wickets: summary?.w ?? batters.filter((b) => b.isOut).length,
          oversText: formatOvers(legalBalls),
          legalBalls,
          // cricapi only exposes the extras total — the breakdown isn't in the payload.
          extras: { byes: 0, legbyes: 0, wides: 0, noballs: 0, penalty: 0, total: extrasRuns },
          batting: batters,
          bowling: (inn.bowling ?? []).map((b) => {
            const legal = oversFloatToBalls(b.o ?? 0);
            return {
              playerId: b.bowler?.id ?? slugify(b.bowler?.name ?? "bowler"),
              playerName: b.bowler?.name ?? "Unknown",
              oversText: formatOvers(legal),
              legalBalls: legal,
              maidens: b.m ?? 0,
              runs: b.r ?? 0,
              wickets: b.w ?? 0,
              economy: b.eco ?? (legal > 0 ? Math.round(((b.r ?? 0) / legal) * 6 * 100) / 100 : null),
              ...(b.wd !== undefined ? { wides: b.wd } : {}),
              ...(b.nb !== undefined ? { noballs: b.nb } : {}),
            };
          }),
          fallOfWickets: [], // not exposed by cricapi's scorecard payload
          yetToBat: [],
          runRate: legalBalls > 0 ? Math.round(((summary?.r ?? 0) / legalBalls) * 6 * 100) / 100 : null,
        };
      }),
    };
  }

  async getBallByBall(matchId: string, sinceBall?: BallRef): Promise<BallEvent[]> {
    // Ball-by-ball needs a paid cricapi plan for most matches. Recorded-fixture
    // mapping below; re-verify against a live key before Phase 2 ships.
    const data = await this.call("match_bbb", { id: matchId }, apiBallByBallSchema, 10_000);
    const events: BallEvent[] = (data.bbb ?? []).map((b, idx) => ({
      matchId,
      innings: b.inning ?? 1,
      over: b.over ?? 0,
      ball: b.ball ?? (idx % 6) + 1,
      bowlerId: b.bowler?.id ?? slugify(b.bowler?.name ?? "bowler"),
      batterId: b.batsman?.id ?? slugify(b.batsman?.name ?? "batter"),
      nonStrikerId: b.non_striker?.id ?? slugify(b.non_striker?.name ?? "non-striker"),
      runs: {
        batter: b.runs ?? 0,
        extras: b.extras ?? 0,
        total: (b.runs ?? 0) + (b.extras ?? 0),
      },
      ...(toExtraType(b.extras_type) ? { extraType: toExtraType(b.extras_type) } : {}),
      ...(b.wicket && b.player_out
        ? {
            wicket: {
              kind: (b.wicket_type ?? "bowled") as WicketKind,
              playerOutId: b.player_out.id ?? slugify(b.player_out.name ?? "batter"),
              fielderIds: [],
            },
          }
        : {}),
      commentaryText: b.commentary ?? `${b.bowler?.name ?? "Bowler"} to ${b.batsman?.name ?? "batter"}`,
      timestamp: typeof b.timestamp === "string" ? b.timestamp : new Date(b.timestamp ?? 0).toISOString(),
    }));
    return sinceBall ? events.filter((e) => isAfterBall(e, sinceBall)) : events;
  }

  async getSquads(matchId: string): Promise<Squads> {
    const data = await this.call("match_squad", { id: matchId }, apiSquadSchema, 60 * 60_000);
    return {
      matchId,
      teams: data.map((team) => ({
        team: teamRefFromName(team.teamName ?? team.shortname ?? "Unknown"),
        players: (team.players ?? []).map((p) => ({
          id: p.id ?? slugify(p.name ?? "player"),
          name: p.name ?? "Unknown",
          ...(toRole(p.role) ? { role: toRole(p.role) } : {}),
          ...(toHand(p.battingStyle) ? { battingHand: toHand(p.battingStyle) } : {}),
          ...(p.bowlingStyle ? { bowlingStyle: p.bowlingStyle } : {}),
          isKeeper: /wk|keeper/i.test(p.role ?? ""),
        })),
      })),
    };
  }

  async getPlayer(playerId: string): Promise<PlayerProfile> {
    let p: z.infer<typeof apiPlayerInfoSchema>;
    try {
      p = await this.call("players_info", { id: playerId }, apiPlayerInfoSchema, 24 * 60 * 60_000);
    } catch (err) {
      if (err instanceof ProviderResponseError) throw new PlayerNotFoundError(PROVIDER, playerId);
      throw err;
    }
    return {
      id: p.id,
      name: p.name,
      ...(p.country ? { country: p.country } : {}),
      ...(toRole(p.role) ? { role: toRole(p.role) } : {}),
      ...(toHand(p.battingStyle) ? { battingHand: toHand(p.battingStyle) } : {}),
      ...(p.bowlingStyle ? { bowlingStyle: p.bowlingStyle } : {}),
      ...(p.dateOfBirth ? { born: p.dateOfBirth.slice(0, 10) } : {}),
    };
  }

  async getPointsTable(seriesId: string): Promise<PointsTable> {
    const rows = await this.call("series_points", { id: seriesId }, apiSeriesPointsSchema, 10 * 60_000);
    return {
      seriesId,
      groups: rows.length
        ? [
            {
              rows: rows.map((r) => {
                const name = r.teamname ?? r.shortname ?? "Unknown";
                return {
                  teamId: `t-${slugify(name)}`,
                  teamName: name,
                  teamShortName: r.shortname ?? teamRefFromName(name).shortName,
                  played: r.matches ?? 0,
                  won: r.wins ?? 0,
                  lost: r.loss ?? 0,
                  tied: r.ties ?? 0,
                  noResult: r.nr ?? 0,
                  // cricapi omits points/NRR on this endpoint; standard 2-per-win shown.
                  points: (r.wins ?? 0) * 2 + (r.ties ?? 0) + (r.nr ?? 0),
                  netRunRate: null,
                };
              }),
            },
          ]
        : [],
    };
  }
}

// ── Mapping internals ────────────────────────────────────────────────────────

function toStatus(m: ApiMatch): MatchStatus {
  const text = (m.status ?? "").toLowerCase();
  if (text.includes("abandon")) return "abandoned";
  if (text.includes("no result")) return "no-result";
  if (m.matchEnded || /won by|tied/.test(text)) return "completed";
  if (m.matchStarted) return text.includes("innings break") ? "innings-break" : "live";
  return "upcoming";
}

function oversFloatToBalls(o: number): number {
  const whole = Math.floor(o);
  const balls = Math.round((o - whole) * 10);
  return whole * 6 + Math.min(balls, 5);
}

function toFixture(m: ApiMatch): Fixture {
  const names = m.teams ?? (m.teamInfo ?? []).map((t) => t.name);
  const home = buildTeam(names[0], m.teamInfo?.[0]?.shortname);
  const away = buildTeam(names[1], m.teamInfo?.[1]?.shortname);
  const status = toStatus(m);
  const format = toMatchFormat(m.matchType);
  const startTime = m.dateTimeGMT ? `${m.dateTimeGMT}${m.dateTimeGMT.endsWith("Z") ? "" : "Z"}` : `${m.date ?? "1970-01-01"}T00:00:00Z`;
  const innings: InningsSummary[] = (m.score ?? []).map((s, idx) => {
    const battingName = s.inning?.replace(/ inning.*/i, "").trim();
    const battingTeam = [home, away].find((t) => t.name === battingName);
    const legalBalls = oversFloatToBalls(s.o ?? 0);
    return {
      number: idx + 1,
      battingTeamId: battingTeam?.id ?? home.id,
      runs: s.r ?? 0,
      wickets: s.w ?? 0,
      oversText: formatOvers(legalBalls),
      legalBalls,
    };
  });
  const lastInnings = innings.at(-1);
  return {
    id: m.id,
    seriesId: m.series_id ?? "unknown-series",
    seriesName: m.name?.split(",")[0] ?? "Cricket",
    format,
    status,
    statusText: m.status ?? "",
    startTime,
    dateKey: (m.date ?? startTime).slice(0, 10),
    venue: parseVenue(m.venue),
    teams: { home, away },
    innings,
    ...(format === "T20" ? { oversPerInnings: 20 } : format === "ODI" ? { oversPerInnings: 50 } : {}),
    ...(status === "live" && lastInnings ? { battingTeamId: lastInnings.battingTeamId } : {}),
  };
}

function buildTeam(name: string | undefined, shortname: string | undefined): TeamRef {
  const ref = teamRefFromName(name ?? "TBC");
  return shortname ? { ...ref, shortName: shortname } : ref;
}

function parseVenue(venue: string | undefined): { name: string; city?: string } {
  if (!venue) return { name: "Unknown venue" };
  const [name, ...rest] = venue.split(",").map((s) => s.trim());
  return { name: name ?? venue, ...(rest.length ? { city: rest.join(", ") } : {}) };
}

function normalizeDismissal(text: string | undefined): string {
  if (!text) return "not out";
  const t = text.trim();
  return /^(not out|batting)$/i.test(t) ? "not out" : t;
}

function toRole(role: string | undefined): PlayerRole | undefined {
  if (!role) return undefined;
  const r = role.toLowerCase();
  if (r.includes("wk") || r.includes("keeper")) return "wicketkeeper";
  if (r.includes("allrounder") || r.includes("all-rounder")) return "allrounder";
  if (r.includes("bowl")) return "bowler";
  if (r.includes("bat")) return "batter";
  return undefined;
}

function toHand(style: string | undefined): BattingHand | undefined {
  if (!style) return undefined;
  if (/left/i.test(style)) return "left";
  if (/right/i.test(style)) return "right";
  return undefined;
}

function toExtraType(t: string | undefined): BallEvent["extraType"] {
  if (!t) return undefined;
  const s = t.toLowerCase();
  if (s.includes("wide")) return "wide";
  if (s.includes("noball") || s.includes("no ball")) return "noball";
  if (s.includes("legbye") || s.includes("leg bye")) return "legbye";
  if (s.includes("bye")) return "bye";
  if (s.includes("penalty")) return "penalty";
  return undefined;
}

/** cricapi sometimes sends "Jul 10" as endDate — anchor it to the start year. */
function normalizeEndDate(endDate: string, startDate: string | undefined): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(endDate)) return endDate.slice(0, 10);
  const year = startDate?.slice(0, 4) ?? `${new Date().getFullYear()}`;
  const parsed = new Date(`${endDate} ${year}`);
  if (Number.isNaN(parsed.getTime())) return startDate ?? endDate;
  // Local date parts, not toISOString() — UTC conversion shifts the day west of GMT+0.
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}
