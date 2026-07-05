/**
 * Mock provider — deterministic fixture data for dev, tests and Storybook.
 * Boots with zero keys; the app must be fully functional on this adapter.
 */
import { MatchNotFoundError, PlayerNotFoundError } from "./errors";
import { buildMockUniverse, type MockUniverse } from "./mock-data";
import type { CricketDataProvider } from "./provider.interface";
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

const PROVIDER = "mock";

export interface MockAdapterOptions {
  /** Injectable clock so tests can freeze the universe. */
  now?: () => Date;
}

export class MockAdapter implements CricketDataProvider {
  private readonly now: () => Date;

  constructor(options: MockAdapterOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  /** Rebuilt per call — cheap, and keeps "today's live match" pinned to today. */
  private universe(): MockUniverse {
    return buildMockUniverse(this.now());
  }

  async getFixtures(date: string): Promise<Fixture[]> {
    return this.universe().fixtures.filter((f) => f.dateKey === date);
  }

  async getSeries(): Promise<Series[]> {
    return this.universe().series;
  }

  async getMatch(matchId: string): Promise<MatchDetail> {
    const detail = this.universe().details[matchId];
    if (!detail) throw new MatchNotFoundError(PROVIDER, matchId);
    return detail;
  }

  async getScorecard(matchId: string): Promise<Scorecard> {
    const scorecard = this.universe().scorecards[matchId];
    if (!scorecard) throw new MatchNotFoundError(PROVIDER, matchId);
    return scorecard;
  }

  async getBallByBall(matchId: string, sinceBall?: BallRef): Promise<BallEvent[]> {
    const universe = this.universe();
    if (!universe.details[matchId]) throw new MatchNotFoundError(PROVIDER, matchId);
    // The mock ships a sampled window (recent overs + reference deliveries),
    // not every ball of the innings — enough to drive the live feed UI.
    const events = universe.balls[matchId] ?? [];
    if (!sinceBall) return events;
    return events.filter((e) => isAfter(e, sinceBall));
  }

  async getSquads(matchId: string): Promise<Squads> {
    const squads = this.universe().squads[matchId];
    if (!squads) throw new MatchNotFoundError(PROVIDER, matchId);
    return squads;
  }

  async getPlayer(playerId: string): Promise<PlayerProfile> {
    const universe = this.universe();
    const profile = universe.players[playerId];
    if (profile) return profile;
    // Fall back to squad membership so every linked player resolves.
    for (const squad of Object.values(universe.squads)) {
      for (const { players } of squad.teams) {
        const found = players.find((p) => p.id === playerId);
        if (found) {
          return {
            id: found.id,
            name: found.name,
            ...(found.role !== undefined ? { role: found.role } : {}),
            ...(found.battingHand !== undefined ? { battingHand: found.battingHand } : {}),
            ...(found.bowlingStyle !== undefined ? { bowlingStyle: found.bowlingStyle } : {}),
          };
        }
      }
    }
    throw new PlayerNotFoundError(PROVIDER, playerId);
  }

  async getPointsTable(seriesId: string): Promise<PointsTable> {
    return this.universe().pointsTables[seriesId] ?? { seriesId, groups: [] };
  }
}

/** Strictly after, by (innings, over, ball). Wides share a ball number with the
 *  re-bowled delivery; a per-event sequence id lands with the Phase 2 pipeline. */
function isAfter(e: BallEvent, since: BallRef): boolean {
  if (e.innings !== since.innings) return e.innings > since.innings;
  if (e.over !== since.over) return e.over > since.over;
  return e.ball > since.ball;
}
