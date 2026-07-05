/**
 * Zod schemas for cricketdata.org (api.cricapi.com/v1) responses.
 *
 * Deliberately tolerant on optional fields — free-tier providers WILL send
 * garbage mid-match (CLAUDE.md §9) — but strict on the envelope so a failure
 * is a loud `ProviderResponseError`, not silent UI corruption.
 *
 * Recorded response fixtures live in `__fixtures__/cricketdata/`; re-record
 * against a live key when the plan changes.
 */
import { z } from "zod";

export const envelopeSchema = z
  .object({
    status: z.string(),
    data: z.unknown().optional(),
    reason: z.string().optional(),
    info: z
      .object({
        hitsToday: z.number().optional(),
        hitsLimit: z.number().optional(),
        offsetRows: z.number().optional(),
        totalRows: z.number().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export const apiScoreSchema = z.object({
  r: z.number().optional(),
  w: z.number().optional(),
  o: z.number().optional(),
  inning: z.string().optional(),
});

export const apiMatchSchema = z
  .object({
    id: z.string(),
    name: z.string().optional(),
    matchType: z.string().optional(),
    status: z.string().optional(),
    venue: z.string().optional(),
    date: z.string().optional(),
    dateTimeGMT: z.string().optional(),
    teams: z.array(z.string()).optional(),
    teamInfo: z
      .array(z.object({ name: z.string(), shortname: z.string().optional(), img: z.string().optional() }))
      .optional(),
    score: z.array(apiScoreSchema).optional(),
    series_id: z.string().optional(),
    matchStarted: z.boolean().optional(),
    matchEnded: z.boolean().optional(),
    tossWinner: z.string().optional(),
    tossChoice: z.string().optional(),
    matchWinner: z.string().optional(),
  })
  .loose();

export const apiMatchListSchema = z.array(apiMatchSchema);

export const apiSeriesSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    odi: z.number().optional(),
    t20: z.number().optional(),
    test: z.number().optional(),
    matches: z.number().optional(),
  })
  .loose();

export const apiSeriesListSchema = z.array(apiSeriesSchema);

export const apiBattingRowSchema = z
  .object({
    batsman: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
    "dismissal-text": z.string().optional(),
    r: z.number().optional(),
    b: z.number().optional(),
    "4s": z.number().optional(),
    "6s": z.number().optional(),
    sr: z.number().optional(),
  })
  .loose();

export const apiBowlingRowSchema = z
  .object({
    bowler: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
    o: z.number().optional(),
    m: z.number().optional(),
    r: z.number().optional(),
    w: z.number().optional(),
    eco: z.number().optional(),
    wd: z.number().optional(),
    nb: z.number().optional(),
  })
  .loose();

export const apiInningSchema = z
  .object({
    inning: z.string().optional(),
    batting: z.array(apiBattingRowSchema).optional(),
    bowling: z.array(apiBowlingRowSchema).optional(),
    extras: z.object({ r: z.number().optional(), b: z.number().optional() }).loose().optional(),
  })
  .loose();

export const apiScorecardSchema = apiMatchSchema.extend({
  scorecard: z.array(apiInningSchema).optional(),
});

export const apiSquadSchema = z.array(
  z
    .object({
      teamName: z.string().optional(),
      shortname: z.string().optional(),
      img: z.string().optional(),
      players: z
        .array(
          z
            .object({
              id: z.string().optional(),
              name: z.string().optional(),
              role: z.string().optional(),
              battingStyle: z.string().optional(),
              bowlingStyle: z.string().optional(),
              country: z.string().optional(),
            })
            .loose(),
        )
        .optional(),
    })
    .loose(),
);

export const apiPlayerInfoSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    dateOfBirth: z.string().optional(),
    role: z.string().optional(),
    battingStyle: z.string().optional(),
    bowlingStyle: z.string().optional(),
    placeOfBirth: z.string().optional(),
    country: z.string().optional(),
    playerImg: z.string().optional(),
    stats: z
      .array(
        z
          .object({
            fn: z.string().optional(),
            matchtype: z.string().optional(),
            stat: z.string().optional(),
            value: z.union([z.string(), z.number()]).optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();

export const apiSeriesPointsSchema = z.array(
  z
    .object({
      teamname: z.string().optional(),
      shortname: z.string().optional(),
      img: z.string().optional(),
      matches: z.number().optional(),
      wins: z.number().optional(),
      loss: z.number().optional(),
      ties: z.number().optional(),
      nr: z.number().optional(),
    })
    .loose(),
);

export const apiBallByBallSchema = z
  .object({
    bbb: z
      .array(
        z
          .object({
            n: z.number().optional(),
            inning: z.number().optional(),
            over: z.number().optional(),
            ball: z.number().optional(),
            batsman: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
            bowler: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
            non_striker: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
            runs: z.number().optional(),
            extras: z.number().optional(),
            extras_type: z.string().optional(),
            wicket: z.boolean().optional(),
            wicket_type: z.string().optional(),
            player_out: z.object({ id: z.string().optional(), name: z.string().optional() }).optional(),
            commentary: z.string().optional(),
            timestamp: z.union([z.string(), z.number()]).optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();
