/**
 * Provider access for the live pipeline — NO React `cache()` here: the poller
 * and replay tickers run outside any request scope, where request-level
 * memoization is meaningless. Pages keep using lib/data.ts.
 */
import "server-only";
import { getProvider } from "@/lib/providers";
import { withCricsheetFallback } from "@/lib/providers/fallback";
import type { BallEvent, Fixture, MatchDetail } from "@/lib/providers/types";

export const liveSource = {
  getMatch(matchId: string): Promise<MatchDetail> {
    return withCricsheetFallback((p) => p.getMatch(matchId));
  },
  getBallByBall(matchId: string): Promise<BallEvent[]> {
    return withCricsheetFallback((p) => p.getBallByBall(matchId));
  },
  getFixtures(date: string): Promise<Fixture[]> {
    return getProvider().getFixtures(date);
  },
};

export type LiveSource = typeof liveSource;
