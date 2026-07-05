/**
 * CricketDataProvider — the adapter contract (CLAUDE.md §3.1).
 *
 * Every data source (Cricsheet replays, cricketdata.org, EntitySport, mock)
 * implements exactly this interface. The app talks to the interface only;
 * provider selection happens once in `lib/providers/index.ts`.
 *
 * Adapters run SERVER-SIDE ONLY — clients must never hit a provider directly
 * (free-tier rate limits are brutal; the server polls once and fans out).
 */
import type {
  BallEvent,
  BallRef,
  Fixture,
  MatchDetail,
  PlayerProfile,
  PointsTable,
  Scorecard,
  Series,
  Squads,
} from "./types";

export interface CricketDataProvider {
  /** Fixtures for a local date key (YYYY-MM-DD) — the home screen. */
  getFixtures(date: string): Promise<Fixture[]>;
  getSeries(): Promise<Series[]>;
  /** Header, teams, venue, toss. */
  getMatch(matchId: string): Promise<MatchDetail>;
  getScorecard(matchId: string): Promise<Scorecard>;
  /** Events strictly after `sinceBall` when provided; full stream otherwise. */
  getBallByBall(matchId: string, sinceBall?: BallRef): Promise<BallEvent[]>;
  getSquads(matchId: string): Promise<Squads>;
  getPlayer(playerId: string): Promise<PlayerProfile>;
  getPointsTable(seriesId: string): Promise<PointsTable>;
}

export type ProviderName = "cricsheet" | "cricketdata" | "entitysport" | "mock";
