/**
 * EntitySport adapter — production candidate. STUB for now (CLAUDE.md §3.1):
 * the interface is locked, the implementation lands when a token is licensed.
 */
import { ProviderNotConfiguredError } from "./errors";
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

const PROVIDER = "entitysport";
const HINT = "EntitySport is a stub until a production token is licensed — use DATA_PROVIDER=mock or cricsheet.";

export class EntitySportAdapter implements CricketDataProvider {
  constructor() {
    if (!process.env.ENTITYSPORT_TOKEN) {
      throw new ProviderNotConfiguredError(PROVIDER, "Set ENTITYSPORT_TOKEN. " + HINT);
    }
  }

  getFixtures(_date: string): Promise<Fixture[]> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
  getSeries(): Promise<Series[]> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
  getMatch(_matchId: string): Promise<MatchDetail> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
  getScorecard(_matchId: string): Promise<Scorecard> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
  getBallByBall(_matchId: string, _sinceBall?: BallRef): Promise<BallEvent[]> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
  getSquads(_matchId: string): Promise<Squads> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
  getPlayer(_playerId: string): Promise<PlayerProfile> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
  getPointsTable(_seriesId: string): Promise<PointsTable> {
    return Promise.reject(new ProviderNotConfiguredError(PROVIDER, HINT));
  }
}
