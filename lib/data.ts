/**
 * Server data access — RSC-facing wrappers around the active provider.
 * `cache()` dedupes within a request (layout + page share one getMatch call).
 * Cross-request caching moves to Redis with the Phase 2 pipeline.
 */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getProvider } from "@/lib/providers";
import { withCricsheetFallback } from "@/lib/providers/fallback";
import { isMatchNotFoundError } from "@/lib/providers/errors";
import type { BallRef } from "@/lib/providers/types";

export const getFixtures = cache(async (date: string) => getProvider().getFixtures(date));

export const getSeries = cache(async () => getProvider().getSeries());

// Match-scoped reads fall back to the bundled Cricsheet files so replay ids
// resolve under any DATA_PROVIDER (see lib/providers/fallback.ts).
export const getMatch = cache(async (matchId: string) => withCricsheetFallback((p) => p.getMatch(matchId)));

/** Unknown match ids render the designed 404, other provider failures bubble to error.tsx. */
export async function getMatchOr404(matchId: string) {
  try {
    return await getMatch(matchId);
  } catch (err) {
    if (isMatchNotFoundError(err)) notFound();
    throw err;
  }
}

export const getScorecard = cache(async (matchId: string) => withCricsheetFallback((p) => p.getScorecard(matchId)));

export const getBallByBall = cache(async (matchId: string, sinceBall?: BallRef) =>
  withCricsheetFallback((p) => p.getBallByBall(matchId, sinceBall)),
);

export const getSquads = cache(async (matchId: string) => withCricsheetFallback((p) => p.getSquads(matchId)));

export const getPlayer = cache(async (playerId: string) => getProvider().getPlayer(playerId));

export const getPointsTable = cache(async (seriesId: string) => getProvider().getPointsTable(seriesId));
