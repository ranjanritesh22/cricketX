/** Shared fixtures for the live-pipeline tests (not a test file itself). */
import type { BallEvent, MatchDetail } from "@/lib/providers/types";

export function testDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    id: "m-test",
    seriesId: "s",
    seriesName: "Test Series",
    format: "T20",
    status: "live",
    statusText: "Live",
    startTime: "2026-07-02T13:30:00.000Z",
    dateKey: "2026-07-02",
    venue: { name: "Test Ground" },
    teams: {
      home: { id: "t-a", name: "Alphas", shortName: "ALP" },
      away: { id: "t-b", name: "Bravos", shortName: "BRV" },
    },
    innings: [],
    oversPerInnings: 20,
    resultText: "Alphas won by 10 runs",
    ...overrides,
  };
}

export function testBall(
  innings: number,
  over: number,
  ball: number,
  total: number,
  opts: { wide?: boolean; noball?: boolean; wicket?: boolean } = {},
): BallEvent {
  return {
    matchId: "m-test",
    innings,
    over,
    ball,
    bowlerId: "p-bowl",
    batterId: "p-bat",
    nonStrikerId: "p-ns",
    runs: { batter: opts.wide || opts.noball ? 0 : total, extras: opts.wide || opts.noball ? total : 0, total },
    ...(opts.wide ? { extraType: "wide" as const } : {}),
    ...(opts.noball ? { extraType: "noball" as const } : {}),
    ...(opts.wicket ? { wicket: { kind: "bowled" as const, playerOutId: "p-bat", fielderIds: [] } } : {}),
    commentaryText: `ball ${innings}.${over}.${ball}`,
    timestamp: new Date(1750000000000 + innings * 1e6 + over * 1e4 + ball * 100 + total).toISOString(),
  };
}
