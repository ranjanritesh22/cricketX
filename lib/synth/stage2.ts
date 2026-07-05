/**
 * Stage 2 — LLM fallback parser (Phase 5, CLAUDE.md §4).
 *
 * For deliveries Stage 1 can't read (confidence < 0.5), one cheap Claude Haiku
 * call with a strict JSON schema returns a `SynthesizedShot`. Server-side only,
 * cached by commentary-text hash, budget-capped per poll, and feature-flagged:
 * the app is fully functional with Stage 1 alone — every failure path simply
 * leaves the event untouched and the client renders the conservative Stage-1
 * shot (`shotFor`).
 *
 * Flag: enabled iff ANTHROPIC_API_KEY is set and SYNTH_LLM !== "0".
 */
import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { BallEvent, SynthesizedShot } from "@/lib/providers/types";
import { FIELDING_POSITIONS } from "@/lib/providers/types";
import { synthesizeShot, type SynthesizeContext } from "./synthesize";

/** Stage-1 confidence below this → try Stage 2 (CLAUDE.md §4). */
export const STAGE2_THRESHOLD = 0.5;
/** LLM calls allowed per enrichment batch — a poll delta is a handful of balls. */
const MAX_CALLS_PER_BATCH = 4;
const CACHE_CAP = 2_000;
const MODEL = "claude-haiku-4-5";

// Zod mirror of SynthesizedShot — the provider WILL send garbage; so may an LLM.
const shotSchema = z.object({
  deliveryType: z.enum(["pace", "spin"]),
  length: z.enum(["yorker", "full", "good", "short", "bouncer"]),
  line: z.enum(["off", "middle", "leg", "wide-off", "wide-leg"]),
  shotType: z.enum([
    "defend", "drive", "cut", "pull", "sweep", "flick",
    "loft", "slog", "edge", "leave", "missed", "run-out-scramble",
  ]),
  wagonZone: z.number().int().min(1).max(8),
  trajectory: z.enum(["ground", "flat", "lofted", "skier"]),
  landingRadius: z.number(),
  fielderRole: z.enum(FIELDING_POSITIONS).optional().nullable(),
  confidence: z.number(),
});

/** JSON schema for the API's structured-output format (no numeric bounds — clamped in code). */
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    deliveryType: { type: "string", enum: ["pace", "spin"] },
    length: { type: "string", enum: ["yorker", "full", "good", "short", "bouncer"] },
    line: { type: "string", enum: ["off", "middle", "leg", "wide-off", "wide-leg"] },
    shotType: {
      type: "string",
      enum: ["defend", "drive", "cut", "pull", "sweep", "flick", "loft", "slog", "edge", "leave", "missed", "run-out-scramble"],
    },
    wagonZone: { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7, 8] },
    trajectory: { type: "string", enum: ["ground", "flat", "lofted", "skier"] },
    landingRadius: { type: "number" },
    fielderRole: { type: ["string", "null"], enum: [...FIELDING_POSITIONS, null] },
    confidence: { type: "number" },
  },
  required: [
    "deliveryType", "length", "line", "shotType", "wagonZone",
    "trajectory", "landingRadius", "fielderRole", "confidence",
  ],
  additionalProperties: false,
} as const;

const SYSTEM = `You convert one ball of cricket commentary into a structured shot description for a 3D reconstruction. Wagon zones (right-hand batter): 1 fine leg, 2 square leg, 3 midwicket, 4 long-on, 5 long-off, 6 covers, 7 point/backward point, 8 third man. landingRadius is 0..1 of the boundary distance. Be conservative: when unsure prefer a plausible, unspectacular reading — never invent a boundary for a dot ball. confidence is your certainty, 0..1.`;

export function isStage2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY) && env.SYNTH_LLM !== "0";
}

export function commentaryHash(text: string): string {
  return createHash("sha256").update(text.trim().toLowerCase()).digest("hex");
}

// Cache by commentary hash — survives dev HMR like the other singletons.
// `null` marks a failed call so one bad line can't burn budget every poll.
const globalStore = globalThis as unknown as { __stadiumxStage2Cache?: Map<string, SynthesizedShot | null> };
const cache = (globalStore.__stadiumxStage2Cache ??= new Map());

function cachePut(key: string, value: SynthesizedShot | null) {
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/** The single LLM round trip — injectable so tests never touch the network. */
export type Stage2Caller = (userPrompt: string) => Promise<unknown>;

let defaultCaller: Stage2Caller | null = null;

function sdkCaller(): Stage2Caller {
  if (!defaultCaller) {
    defaultCaller = async (userPrompt: string) => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ timeout: 6_000, maxRetries: 1 });
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content: userPrompt }],
      });
      if (response.stop_reason === "refusal") return null;
      const text = response.content.find((b) => b.type === "text");
      return text ? JSON.parse(text.text) : null;
    };
  }
  return defaultCaller;
}

function promptFor(event: BallEvent): string {
  const facts = [
    `runs off the bat: ${event.runs.batter}`,
    `extras: ${event.runs.extras}${event.extraType ? ` (${event.extraType})` : ""}`,
    event.wicket ? `wicket: ${event.wicket.kind}` : "no wicket",
  ].join(", ");
  return `Commentary: "${event.commentaryText}"\nStructured facts: ${facts}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Validate + reconcile an LLM result against what the event provably says. */
export function reconcileShot(raw: unknown, event: BallEvent): SynthesizedShot | null {
  const parsed = shotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  const runs = event.runs.batter;
  const isBoundary = runs === 4 || runs === 6;
  return {
    deliveryType: s.deliveryType,
    length: s.length,
    line: s.line,
    shotType: s.shotType,
    wagonZone: s.wagonZone as SynthesizedShot["wagonZone"],
    trajectory: runs === 6 ? (s.trajectory === "skier" ? "skier" : "lofted") : s.trajectory,
    landingRadius: isBoundary ? 1 : clamp(s.landingRadius, 0, 0.9),
    ...(s.fielderRole ? { fielderRole: s.fielderRole } : {}),
    runsScored: runs,
    isBoundary,
    // A parsed Stage-2 result is actionable — keep it above the generic-animation
    // threshold, but never claim rules-parser certainty.
    confidence: clamp(s.confidence, STAGE2_THRESHOLD + 0.05, 0.9),
  };
}

export interface EnrichOptions {
  call?: Stage2Caller;
  ctxFor?: (event: BallEvent) => SynthesizeContext;
  env?: NodeJS.ProcessEnv;
}

/**
 * Attach Stage-2 `synth` to low-confidence events. Never throws; events that
 * can't be enriched pass through untouched (< 2 KB SSE budget: a synth object
 * adds ~250 B, still comfortably inside).
 */
export async function enrichEvents(events: BallEvent[], opts: EnrichOptions = {}): Promise<BallEvent[]> {
  if (events.length === 0 || !isStage2Enabled(opts.env)) return events;
  const call = opts.call ?? sdkCaller();
  let budget = MAX_CALLS_PER_BATCH;

  return Promise.all(
    events.map(async (event) => {
      if (event.synth) return event;
      const stage1 = synthesizeShot(event, opts.ctxFor?.(event));
      if (stage1.confidence >= STAGE2_THRESHOLD) return event;

      const key = commentaryHash(event.commentaryText);
      if (cache.has(key)) {
        const hit = cache.get(key);
        return hit ? { ...event, synth: { ...hit, runsScored: event.runs.batter } } : event;
      }
      if (budget <= 0) return event;
      budget -= 1;

      try {
        const raw = await call(promptFor(event));
        const shot = reconcileShot(raw, event);
        cachePut(key, shot);
        return shot ? { ...event, synth: shot } : event;
      } catch (err) {
        console.warn(`[synth:stage2] LLM fallback failed for ${event.over}.${event.ball}:`, err);
        cachePut(key, null);
        return event;
      }
    }),
  );
}

/** Test hook. */
export function resetStage2Cache() {
  cache.clear();
}
