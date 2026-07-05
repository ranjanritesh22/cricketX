/**
 * Replay engine — `?replay=<cricsheet-match-id>&speed=8x` (CLAUDE.md §3.1).
 *
 * First-class, not a hack: a replay session rebuilds a historical match ball
 * by ball and pushes it through the SAME store/SSE/client pipeline a live
 * match uses. This is how the live UX (and later the 3D engine) gets
 * developed and demoed without burning provider quota, and it doubles as the
 * user-facing "Match Replay" feature.
 *
 * Sessions are keyed (matchId, speed) — viewers of the same key watch
 * together. Sessions are single-instance by nature (a local timer drives
 * them) and always live in the dedicated replay memory store.
 */
import type { BallEvent, InningsSummary, MatchDetail } from "@/lib/providers/types";
import { applyEventToInnings, buildHeader, inningsTeamResolver } from "./header";
import { liveSource, type LiveSource } from "./source";
import { getReplayStore, type MemoryLiveStore } from "./store";
import { EVENT_CAP, type LiveHeader, type LiveState, type StoredEvent } from "./types";

/** Real-world T20 cadence ≈ one delivery every ~40s; speed divides it. */
const BASE_BALL_MS = 40_000;
const MIN_TICK_MS = 300;

export class ReplayUnavailableError extends Error {
  constructor(matchId: string) {
    super(`No ball-by-ball data available to replay match "${matchId}"`);
    this.name = "ReplayUnavailableError";
  }
}

/** Name-based guard — instances can cross dev-bundler module graphs via the
 *  globalThis session registry, where bare `instanceof` fails. */
export function isReplayUnavailableError(err: unknown): err is ReplayUnavailableError {
  return err instanceof ReplayUnavailableError || (err instanceof Error && err.name === "ReplayUnavailableError");
}

export function parseSpeed(raw: string | null | undefined): number {
  const n = Number.parseFloat((raw ?? "").replace(/x$/i, ""));
  if (!Number.isFinite(n) || n <= 0) return 8;
  return Math.min(Math.max(n, 1), 64);
}

export class ReplaySession {
  readonly key: string;
  private refs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private loadPromise: Promise<void> | null = null;
  private detail!: MatchDetail;
  private timeline: BallEvent[] = [];
  private teamFor!: (n: number) => string;
  private idx = 0;
  private version = 0;
  private innings: InningsSummary[] = [];
  private stored: StoredEvent[] = [];
  private breakEmitted = false;
  private finished = false;

  constructor(
    readonly sourceMatchId: string,
    readonly speed: number,
    private readonly store: MemoryLiveStore = getReplayStore(),
    private readonly source: LiveSource = liveSource,
    private readonly intervalOverrideMs?: number,
  ) {
    this.key = `replay:${sourceMatchId}:${speed}x`;
  }

  get intervalMs(): number {
    return this.intervalOverrideMs ?? Math.max(MIN_TICK_MS, Math.round(BASE_BALL_MS / this.speed));
  }

  async attach(): Promise<void> {
    await this.load();
    if (this.finished && this.refs <= 0) await this.reset(); // fresh viewer after the end → rewatch
    this.refs += 1;
    this.start();
  }

  detach(): void {
    this.refs -= 1;
    if (this.refs <= 0) this.pause(); // keep position; resumes on next attach
  }

  private load(): Promise<void> {
    this.loadPromise ??= (async () => {
      this.detail = await this.source.getMatch(this.sourceMatchId);
      this.timeline = await this.source.getBallByBall(this.sourceMatchId);
      if (this.timeline.length === 0) throw new ReplayUnavailableError(this.sourceMatchId);
      this.teamFor = inningsTeamResolver(this.detail);
      await this.reset();
    })().catch((err) => {
      this.loadPromise = null; // allow retry on the next connection
      throw err;
    });
    return this.loadPromise;
  }

  private async reset(): Promise<void> {
    this.idx = 0;
    this.version = 1;
    this.stored = [];
    this.breakEmitted = false;
    this.finished = false;
    const firstInnings = this.timeline[0]?.innings ?? 1;
    this.innings = [
      {
        number: firstInnings,
        battingTeamId: this.teamFor(firstInnings),
        runs: 0,
        wickets: 0,
        oversText: "0",
        legalBalls: 0,
      },
    ];
    await this.persist(buildHeader(this.detail, this.innings, null, "live"), null);
  }

  private start(): void {
    if (this.timer || this.finished) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  private pause(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Advance one step: a break, the next ball, or completion. Exposed for tests. */
  async tick(): Promise<void> {
    if (this.finished) {
      this.pause();
      return;
    }
    const event = this.timeline[this.idx];

    if (!event) {
      this.finished = true;
      this.pause();
      this.version += 1;
      await this.persist(buildHeader(this.detail, this.innings, this.timeline.at(-1) ?? null, "completed"), null, true);
      return;
    }

    // One tick of innings break before the new innings' first ball.
    if (!this.breakEmitted && event.innings > (this.innings.at(-1)?.number ?? 0)) {
      this.breakEmitted = true;
      this.version += 1;
      await this.persist(buildHeader(this.detail, this.innings, this.timeline[this.idx - 1] ?? null, "innings-break"), null, true);
      return;
    }

    this.breakEmitted = false;
    this.innings = applyEventToInnings(this.innings, event, this.teamFor);
    this.idx += 1;
    this.version += 1;
    await this.persist(buildHeader(this.detail, this.innings, event, "live"), event);
  }

  private async persist(header: LiveHeader, event: BallEvent | null, statusOnly = false): Promise<void> {
    if (event) {
      this.stored = [...this.stored, { v: this.version, event }].slice(-EVENT_CAP);
    }
    const state: LiveState = {
      matchId: this.key,
      version: this.version,
      detail: this.detail,
      header,
      events: this.stored,
      seen: this.idx,
      updatedAt: new Date().toISOString(),
    };
    await this.store.set(state);
    if (event) {
      await this.store.publish(this.key, {
        kind: "ball",
        matchId: this.key,
        version: this.version,
        header,
        events: [event],
        updatedAt: state.updatedAt,
      });
    } else if (statusOnly) {
      await this.store.publish(this.key, {
        kind: "status",
        matchId: this.key,
        version: this.version,
        header,
        updatedAt: state.updatedAt,
      });
    }
  }

  /** Test hooks. */
  get progress() {
    return { idx: this.idx, version: this.version, finished: this.finished, innings: this.innings };
  }
}

const globalStore = globalThis as unknown as { __stadiumxReplaySessions?: Map<string, ReplaySession> };
const sessions = (globalStore.__stadiumxReplaySessions ??= new Map<string, ReplaySession>());

export async function acquireReplaySession(matchId: string, speedRaw: string | null | undefined): Promise<ReplaySession> {
  const speed = parseSpeed(speedRaw);
  const key = `replay:${matchId}:${speed}x`;
  let session = sessions.get(key);
  if (!session) {
    session = new ReplaySession(matchId, speed);
    sessions.set(key, session);
  }
  try {
    await session.attach();
  } catch (err) {
    sessions.delete(key); // failed to load — don't cache a broken session
    throw err;
  }
  return session;
}

/** Test hook. */
export function resetReplaySessions() {
  sessions.clear();
}
