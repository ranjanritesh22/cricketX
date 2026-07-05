/**
 * Zod schema for Cricsheet match JSON (data_version 1.x).
 * Validated at the boundary — unknown fields pass through, required structure
 * is enforced so garbage fails loudly (CLAUDE.md §9).
 *
 * Cricsheet data is ODC-BY licensed — attributed in the app footer.
 */
import { z } from "zod";

export const cricsheetDeliverySchema = z.object({
  batter: z.string(),
  bowler: z.string(),
  non_striker: z.string(),
  runs: z.object({
    batter: z.number(),
    extras: z.number(),
    total: z.number(),
    non_boundary: z.boolean().optional(),
  }),
  extras: z
    .object({
      wides: z.number().optional(),
      noballs: z.number().optional(),
      byes: z.number().optional(),
      legbyes: z.number().optional(),
      penalty: z.number().optional(),
    })
    .optional(),
  wickets: z
    .array(
      z.object({
        kind: z.string(),
        player_out: z.string(),
        fielders: z.array(z.object({ name: z.string().optional(), substitute: z.boolean().optional() })).optional(),
      }),
    )
    .optional(),
  replacements: z.unknown().optional(),
  review: z.unknown().optional(),
  actual_delivery: z.string().optional(),
});

export const cricsheetInningsSchema = z.object({
  team: z.string(),
  overs: z
    .array(
      z.object({
        over: z.number(),
        deliveries: z.array(cricsheetDeliverySchema),
      }),
    )
    .optional(),
  target: z.object({ overs: z.number().optional(), runs: z.number().optional() }).optional(),
  declared: z.boolean().optional(),
  forfeited: z.boolean().optional(),
  absent_hurt: z.array(z.string()).optional(),
  penalty_runs: z.object({ pre: z.number().optional(), post: z.number().optional() }).optional(),
  super_over: z.boolean().optional(),
});

export const cricsheetMatchSchema = z.object({
  meta: z.object({
    data_version: z.string(),
    created: z.string(),
    revision: z.number(),
  }),
  info: z
    .object({
      balls_per_over: z.number().default(6),
      city: z.string().optional(),
      dates: z.array(z.string()),
      event: z.object({ name: z.string().optional(), match_number: z.number().optional(), group: z.union([z.string(), z.number()]).optional(), stage: z.string().optional() }).optional(),
      gender: z.string().optional(),
      match_type: z.string(),
      match_type_number: z.number().optional(),
      officials: z
        .object({
          match_referees: z.array(z.string()).optional(),
          reserve_umpires: z.array(z.string()).optional(),
          tv_umpires: z.array(z.string()).optional(),
          umpires: z.array(z.string()).optional(),
        })
        .optional(),
      outcome: z.object({
        winner: z.string().optional(),
        result: z.string().optional(),
        eliminator: z.string().optional(),
        bowl_out: z.string().optional(),
        method: z.string().optional(),
        by: z.object({ runs: z.number().optional(), wickets: z.number().optional(), innings: z.number().optional() }).optional(),
      }),
      overs: z.number().optional(),
      player_of_match: z.array(z.string()).optional(),
      players: z.record(z.string(), z.array(z.string())),
      registry: z.object({ people: z.record(z.string(), z.string()) }),
      season: z.union([z.string(), z.number()]).optional(),
      team_type: z.string().optional(),
      teams: z.array(z.string()).min(2),
      toss: z.object({ decision: z.string(), winner: z.string(), uncontested: z.boolean().optional() }).optional(),
      venue: z.string().optional(),
    })
    .loose(),
  innings: z.array(cricsheetInningsSchema),
});

export type CricsheetMatch = z.infer<typeof cricsheetMatchSchema>;
export type CricsheetDelivery = z.infer<typeof cricsheetDeliverySchema>;
