"use client";

/**
 * The Live Reconstruction panel — the collapsible stadium canvas fed by the
 * same live stream as the commentary feed (one EventSource per stream, shared
 * via the zustand registry in `use-live-match`).
 *
 * Phase 4: the viewport is the lazily-loaded 3D stadium by default, with the
 * Phase-3 2D pitch map as the graceful-degradation rung (no WebGL,
 * `prefers-reduced-motion`, or the user's own 2D/3D toggle) — CLAUDE.md §9's
 * ladder: 3D → 2D → text. Both views consume the identical PlayableBall
 * queue, so switching modes never desyncs the playhead.
 *
 * Playback model (CLAUDE.md §5.3): snapshot history renders instantly as the
 * wagon wheel; every delta ball plays as a scene (~4–6s in 3D, ~2–3s in 2D).
 * Events arriving faster than playback queue up — a "⏩ N balls behind" chip
 * skips to live. Honesty first: it's labeled a reconstruction, and low-parse-
 * confidence balls say so instead of faking detail.
 */
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { ballLabel } from "@/lib/format";
import type { WireSnapshot } from "@/lib/live/types";
import type { BallEvent, SynthesizedShot } from "@/lib/providers/types";
import { shotFor } from "@/lib/synth";
import { useLiveMatch } from "@/components/live/use-live-match";
import { setPlayhead } from "@/components/live/use-playhead";
import { playbackMillis3D } from "@/components/stadium/choreography";
import { StadiumView, supportsWebGL, type CameraPreset } from "@/components/stadium/stadium-view";
import { venueTheme } from "@/components/stadium/venue-theme";
import type { ActorRole, ProjectedActor } from "@/components/stadium/stadium-types";
import { deriveLiveStats, economy, milestoneAt, oversText, strikeRate } from "@/components/stadium/live-stats";
import { PitchMap, outcomeColor, playbackMillis, type PlayableBall } from "./pitch-map";

function keyOf(e: BallEvent): string {
  return `${e.innings}-${e.over}-${e.ball}-${e.timestamp}`;
}

/** "Bowler to Batter, …" → "Batter" (best-effort, live providers follow this shape). */
function batterName(e: BallEvent): string | null {
  const match = /^(.{2,40}?) to (.{2,40}?)[,.!]/.exec(e.commentaryText);
  const name = match?.[2]?.trim();
  return name && name.length <= 24 ? name : null;
}

const SHOT_LABEL: Record<SynthesizedShot["shotType"], string> = {
  defend: "Defended",
  drive: "Driven",
  cut: "Cut",
  pull: "Pulled",
  sweep: "Swept",
  flick: "Flicked",
  loft: "Lofted",
  slog: "Slogged",
  edge: "Edged",
  leave: "Left alone",
  missed: "No contact",
  "run-out-scramble": "Scramble",
};

function pillText(ball: PlayableBall): string {
  const { event } = ball;
  const name = batterName(event);
  if (event.wicket) return `WICKET · ${event.wicket.kind}`;
  if (event.runs.batter === 6) return name ? `SIX! ${name}` : "SIX!";
  if (event.runs.batter === 4) return name ? `FOUR! ${name}` : "FOUR!";
  if (event.extraType === "wide") return "Wide";
  if (event.extraType === "noball") return "No ball";
  const runs = event.runs.total;
  const runText = runs === 0 ? "Dot ball" : `${runs} run${runs === 1 ? "" : "s"}`;
  return name ? `${runText} · ${name}` : runText;
}

function sceneText(ball: PlayableBall): string {
  const { shot, event } = ball;
  if (event.wicket) return `${event.wicket.kind}`;
  const where = shot.fielderRole ? ` to ${shot.fielderRole.replace(/-/g, " ")}` : "";
  return `${SHOT_LABEL[shot.shotType]}${where}`;
}

const MODE_KEY = "sx-view-mode";
const CAMERA_LABEL: Record<CameraPreset, string> = { broadcast: "TV", batter: "Bat", bird: "Bird", orbit: "Free" };

export function ReconstructionPanel({
  streamPath,
  initial,
  chip,
}: {
  streamPath: string;
  initial: WireSnapshot | null;
  chip: string;
}) {
  const state = useLiveMatch(streamPath, initial);
  const reduced = useReducedMotion() ?? false;
  const [collapsed, setCollapsed] = useState(false);
  // Index of the last ball already drawn into the wagon wheel.
  const [cursor, setCursor] = useState(() => (initial?.events.length ?? 0) - 1);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  // Ambient reconstruction: when a stream is static (the frozen demo match, or
  // a finished game) no deltas ever arrive, so the stadium would just freeze.
  // Instead we quietly loop the last over so the ball keeps being bowled and
  // hit. It self-disables the moment a real live delta lands.
  const [ambient, setAmbient] = useState(false);
  const timer = useRef<number | null>(null);
  // Screen-space actor positions, written by the 3D scene each frame and read
  // by the HTML label overlay (a ref, so it never re-renders the canvas).
  const actorsRef = useRef<ProjectedActor[]>([]);

  // 3D by default; downgraded by no-WebGL / reduced-motion, or by the user.
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [webglOk, setWebglOk] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("broadcast");
  useEffect(() => {
    if (!supportsWebGL()) setWebglOk(false);
    else if (window.localStorage.getItem(MODE_KEY) === "2d") setMode("2d");
  }, []);
  const canRender3D = webglOk && !reduced;
  const use3D = canRender3D && mode === "3d";
  const toggleMode = () => {
    setMode((m) => {
      const next = m === "3d" ? "2d" : "3d";
      try {
        window.localStorage.setItem(MODE_KEY, next);
      } catch {
        /* private mode — the toggle just won't persist */
      }
      return next;
    });
  };

  const balls: PlayableBall[] = useMemo(
    () => state.events.map((event) => ({ key: keyOf(event), event, shot: shotFor(event) })),
    [state.events],
  );

  const venue = state.detail?.venue;
  const geom = useMemo(() => {
    const t = venueTheme(venue);
    return { rx: t.rx, rz: t.rz };
  }, [venue]);
  const oversPerInnings = state.detail?.oversPerInnings ?? 20;
  const battingTeamId = state.header?.battingTeamId ?? state.detail?.battingTeamId;
  const { battingColor, fieldingColor } = useMemo(() => {
    const home = state.detail?.teams.home;
    const away = state.detail?.teams.away;
    const batting = battingTeamId && away?.id === battingTeamId ? away : home;
    const fielding = batting === home ? away : home;
    return {
      battingColor: batting?.primaryColor ?? "#3B82F6",
      fieldingColor: fielding?.primaryColor ?? "#2E8B6E",
    };
  }, [state.detail, battingTeamId]);

  // Every snapshot (first load and reconnects) redraws history instantly —
  // only deltas received while connected get the full ball-by-ball scene.
  const snapshotCut = state.version === state.snapshotVersion;
  useEffect(() => {
    if (snapshotCut) {
      setCursor(balls.length - 1);
      setActiveIdx(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.snapshotVersion, snapshotCut]);

  // Advance the queue one scene at a time. If playback falls far behind the
  // stream (fast replays, reconnect bursts), auto-catch-up: draw the backlog
  // into the wheel instantly and keep only the freshest balls animating.
  const CATCHUP_AT = 8;
  useEffect(() => {
    if (activeIdx !== null || collapsed) return;
    const last = balls.length - 1;
    let from = cursor;
    if (last - from > CATCHUP_AT) {
      from = last - 2;
      setCursor(from);
    }
    const next = from + 1;
    if (next > last || next < 0) return;
    setActiveIdx(next);
    const ball = balls[next];
    const duration = reduced
      ? 250
      : ball
        ? use3D
          ? playbackMillis3D(ball.event, ball.shot, geom)
          : playbackMillis(ball.shot)
        : 800;
    timer.current = window.setTimeout(() => {
      setActiveIdx(null);
      setCursor(next);
    }, duration);
  }, [balls, cursor, activeIdx, collapsed, reduced, use3D, geom]);

  // Turn ambient mode on once a stream has been static for a few seconds (the
  // demo match never streams, finished games never will) — off the instant a
  // real delta bumps the version past the snapshot.
  useEffect(() => {
    if (!snapshotCut || collapsed || reduced || balls.length < 2) {
      setAmbient(false);
      return;
    }
    const id = window.setTimeout(() => setAmbient(true), 4000);
    return () => window.clearTimeout(id);
  }, [snapshotCut, collapsed, reduced, balls.length, state.version]);

  // The loop: once parked at the last ball, rewind ~an over and let the normal
  // driver replay it forward again.
  const AMBIENT_WINDOW = 6;
  useEffect(() => {
    if (!ambient || activeIdx !== null || collapsed) return;
    const last = balls.length - 1;
    if (last < 1 || cursor < last) return; // only when caught up to the end
    const inn = balls[last]?.event.innings;
    let start = last;
    while (start > 0 && last - start < AMBIENT_WINDOW && balls[start - 1]?.event.innings === inn) start -= 1;
    if (start >= last) return;
    const id = window.setTimeout(() => setCursor(start - 1), 2000);
    return () => window.clearTimeout(id);
  }, [ambient, activeIdx, cursor, balls, collapsed]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const active = activeIdx !== null ? (balls[activeIdx] ?? null) : null;
  const shown = active ?? (cursor >= 0 ? (balls[cursor] ?? null) : null);
  const behind = balls.length - 1 - (activeIdx ?? cursor);

  // Publish the ball on screen so the commentary feed can highlight/scroll to
  // the exact same delivery — the stadium ↔ ball-by-ball sync.
  const shownKey = shown?.key ?? null;
  useEffect(() => {
    setPlayhead(streamPath, shownKey);
    return () => setPlayhead(streamPath, null);
  }, [shownKey, streamPath]);
  const currentInnings = shown?.event.innings ?? balls.at(-1)?.event.innings;

  // The accumulated wheel: scoring shots of the innings on screen, up to the playhead.
  const wagon = useMemo(() => {
    // During the ambient loop, keep the full innings wheel so it doesn't flicker
    // smaller each time we rewind an over.
    const upto = ambient ? balls.length - 1 : (activeIdx ?? cursor);
    return balls
      .slice(0, upto + 1)
      .filter((b) => b.event.innings === currentInnings && (b.shot.runsScored > 0 || b.shot.isBoundary));
  }, [balls, activeIdx, cursor, currentInnings, ambient]);

  // ── Live player figures (this innings, up to the ball on screen) ──
  const uptoIdx = activeIdx ?? cursor;
  const liveStats = useMemo(
    () => deriveLiveStats(state.events, currentInnings ?? 1, uptoIdx),
    [state.events, currentInnings, uptoIdx],
  );

  // Name + stat text for each on-field actor the overlay can label.
  const labelData = useMemo<Partial<Record<ActorRole, { name: string; sub?: string; accent: string }>>>(() => {
    if (!shown) return {};
    const e = shown.event;
    const d: Partial<Record<ActorRole, { name: string; sub?: string; accent: string }>> = {};
    const striker = liveStats.bat.get(e.batterId);
    const nonStriker = liveStats.bat.get(e.nonStrikerId);
    const bowler = liveStats.bowl.get(e.bowlerId);
    const sr = striker && striker.balls ? Math.round(strikeRate(striker.runs, striker.balls) ?? 0) : null;
    d.striker = {
      name: liveStats.names.get(e.batterId) ?? "Striker",
      sub: striker ? `${striker.runs} (${striker.balls})${sr != null ? ` · SR ${sr}` : ""}` : "on strike",
      accent: battingColor,
    };
    d.nonStriker = {
      name: liveStats.names.get(e.nonStrikerId) ?? "Non-striker",
      sub: nonStriker ? `${nonStriker.runs} (${nonStriker.balls})` : "at the other end",
      accent: battingColor,
    };
    const econ = bowler ? economy(bowler.runs, bowler.balls) : null;
    d.bowler = {
      name: liveStats.names.get(e.bowlerId) ?? "Bowler",
      sub: bowler
        ? `${bowler.wickets}/${bowler.runs} · ${oversText(bowler.balls)} ov${econ != null ? ` · Econ ${econ.toFixed(1)}` : ""}`
        : "into his spell",
      accent: fieldingColor,
    };
    d.keeper = { name: "† Keeper", sub: "Wicketkeeper", accent: fieldingColor };
    if (shown.shot.fielderRole && shown.shot.fielderRole !== "wicketkeeper") {
      d.fielder = { name: shown.shot.fielderRole.replace(/-/g, " "), sub: "Fielder", accent: fieldingColor };
    }
    return d;
  }, [shown, liveStats, battingColor, fieldingColor]);

  // 50/100 brought up on the ball currently animating.
  const milestone = useMemo(
    () => (activeIdx != null ? milestoneAt(state.events, activeIdx) : null),
    [activeIdx, state.events],
  );

  // The big centered banner + screen flash for the marquee moments.
  const celebration = useMemo<Celebration | null>(() => {
    if (!active) return null;
    if (milestone) {
      return {
        key: `${active.key}-ms`,
        big: milestone.kind === "hundred" ? "HUNDRED" : "FIFTY",
        sub: `${milestone.name ?? "Batter"} · ${milestone.runs} runs`,
        accent: "#F5B82E",
      };
    }
    if (active.event.wicket) {
      return { key: `${active.key}-w`, big: "WICKET", sub: active.event.wicket.kind, accent: "#E5484D" };
    }
    if (active.event.runs.batter === 6) {
      return { key: `${active.key}-6`, big: "SIX!", sub: liveStats.names.get(active.event.batterId) ?? "", accent: "#8B5CF6" };
    }
    return null;
  }, [active, milestone, liveStats]);

  const skip = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    setActiveIdx(null);
    setCursor(balls.length - 1);
  };

  return (
    <LazyMotion features={domAnimation} strict>
      <section className="overflow-hidden rounded-2xl border border-edge bg-card">
        <header className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
            <span className={cn("size-1.5 rounded-full bg-gold", !reduced && "animate-live-pulse")} />
            {chip}
          </span>
          {canRender3D && !collapsed && (
            <button
              type="button"
              onClick={toggleMode}
              aria-label={use3D ? "Switch to 2D pitch map" : "Switch to 3D stadium"}
              className="ml-auto rounded-full border border-edge px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-ink-soft uppercase transition-colors hover:bg-card-raised hover:text-ink"
            >
              {use3D ? "2D" : "3D"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand pitch view" : "Collapse pitch view"}
            className="flex size-7 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-card-raised hover:text-ink"
          >
            <svg
              viewBox="0 0 16 16"
              className={cn("size-3.5 transition-transform duration-200", collapsed && "rotate-180")}
              aria-hidden="true"
            >
              <path d="M3 10l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </header>

        {!collapsed && (
          <div className="relative border-t border-edge bg-night/40">
            {use3D ? (
              <StadiumView
                active={active}
                wagon={wagon.filter((b) => b.key !== active?.key)}
                venue={venue}
                preset={preset}
                battingColor={battingColor}
                fieldingColor={fieldingColor}
                oversPerInnings={oversPerInnings}
                actorsRef={actorsRef}
              />
            ) : (
              <PitchMap wagon={wagon} active={active} reduced={reduced} />
            )}

            {/* Floating name + live-stat chips over each on-field actor (3D only) */}
            {use3D && <PlayerLabels actorsRef={actorsRef} data={labelData} />}

            {/* Marquee-moment banner: SIX / WICKET / FIFTY / HUNDRED */}
            <CelebrationOverlay celebration={celebration} reduced={reduced} />

            {/* Camera presets — 3D only (CLAUDE.md §5.3) */}
            {use3D && (
              <div className="absolute bottom-3 left-3 flex gap-0.5 rounded-full border border-edge bg-night/85 p-0.5 backdrop-blur">
                {(Object.keys(CAMERA_LABEL) as CameraPreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    aria-pressed={preset === p}
                    aria-label={`${p} camera`}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors",
                      preset === p ? "bg-gold text-night" : "text-ink-faint hover:text-ink",
                    )}
                  >
                    {CAMERA_LABEL[p]}
                  </button>
                ))}
              </div>
            )}

            {/* Event pill — FotMob-style overlay for the ball on screen */}
            <AnimatePresence mode="wait">
              {shown && (
                <m.div
                  key={shown.key}
                  initial={reduced ? false : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-edge bg-night/85 px-3 py-1.5 backdrop-blur"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: outcomeColor(shown.event, shown.shot) }}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-bold text-ink">{pillText(shown)}</span>
                  <span className="score-figures text-[10px] font-semibold text-ink-faint">
                    {ballLabel(shown.event.over, shown.event.ball)}
                  </span>
                </m.div>
              )}
            </AnimatePresence>

            {/* Ambient-loop indicator — honest about what's on screen */}
            {ambient && (
              <span className="absolute top-3 left-3 rounded-full border border-edge bg-night/80 px-2 py-0.5 text-[10px] font-bold tracking-wide text-ink-soft uppercase backdrop-blur">
                ↻ Last over
              </span>
            )}

            {/* Queue chip — events arriving faster than playback */}
            {behind > 1 && !ambient && (
              <button
                type="button"
                onClick={skip}
                className="absolute right-3 bottom-3 rounded-full bg-gold px-2.5 py-1 text-[11px] font-bold text-night shadow-sm transition-opacity hover:opacity-90"
              >
                {behind} balls behind ⏩
              </button>
            )}

            {balls.length === 0 && (
              <p className="absolute inset-x-0 bottom-4 text-center text-xs text-ink-soft">
                Waiting for the first ball…
              </p>
            )}
          </div>
        )}

        <footer className="flex items-center justify-between gap-3 border-t border-edge px-4 py-2.5">
          <p className="min-w-0 truncate text-[11px] text-ink-soft">
            {shown ? (
              <>
                <span className="score-figures font-bold text-ink">
                  {ballLabel(shown.event.over, shown.event.ball)}
                </span>
                <span className="mx-1.5 text-ink-faint">·</span>
                {sceneText(shown)}
                {shown.shot.confidence < 0.5 && <span className="text-ink-faint"> · generic reconstruction</span>}
              </>
            ) : (
              "Synthesized from ball-by-ball data — not real tracking."
            )}
          </p>
          <span className="flex shrink-0 items-center gap-2.5 text-[10px] text-ink-faint" aria-hidden="true">
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-four" /> 4
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-six" /> 6
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-wicket" /> W
            </span>
          </span>
        </footer>
      </section>
    </LazyMotion>
  );
}

// ── Floating player labels (which player is where + hover stats) ─────────────

// Keeper is intentionally omitted — it sits right behind the striker and its
// chip only ever collides with hers; the other four spread across the field.
const LABEL_ROLES: ActorRole[] = ["bowler", "striker", "nonStriker", "fielder"];

type LabelDatum = { name: string; sub?: string; accent: string };

/**
 * HTML chips floated over each on-field actor. The 3D scene writes screen
 * positions into `actorsRef` every frame; a single rAF loop here moves the
 * chips (no React re-render, so the canvas is untouched). Hovering a chip
 * reveals the player's live figures.
 */
function PlayerLabels({
  actorsRef,
  data,
}: {
  actorsRef: { current: ProjectedActor[] };
  data: Partial<Record<ActorRole, LabelDatum>>;
}) {
  const chipRefs = useRef<Partial<Record<ActorRole, HTMLDivElement | null>>>({});
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const actors = actorsRef.current;
      for (const role of LABEL_ROLES) {
        const el = chipRefs.current[role];
        if (!el) continue;
        const a = actors.find((x) => x.role === role);
        if (a && a.visible && data[role]) {
          el.style.transform = `translate3d(${a.x}px, ${a.y}px, 0)`;
          el.style.opacity = "1";
        } else {
          el.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [actorsRef, data]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {LABEL_ROLES.map((role) => {
        const d = data[role];
        if (!d) return null;
        return (
          <div
            key={role}
            ref={(el) => void (chipRefs.current[role] = el)}
            className="pointer-events-auto absolute top-0 left-0 transition-opacity duration-150"
            style={{ opacity: 0, willChange: "transform, opacity" }}
          >
            <div className="group flex -translate-x-1/2 -translate-y-full flex-col items-center">
              <div className="pointer-events-none absolute bottom-full mb-1 hidden min-w-max flex-col items-center rounded-md border border-edge bg-night/95 px-2 py-1 text-center shadow-lg group-hover:flex">
                <span className="text-[11px] font-bold text-ink">{d.name}</span>
                {d.sub && <span className="score-figures text-[10px] text-ink-soft">{d.sub}</span>}
              </div>
              <span
                className="max-w-[120px] truncate rounded-full border px-1.5 py-0.5 text-[9px] font-bold text-ink capitalize shadow-sm backdrop-blur"
                style={{ borderColor: `${d.accent}88`, backgroundColor: "rgba(10,14,18,0.72)" }}
              >
                {d.name}
              </span>
              <span className="mt-0.5 size-1 rounded-full" style={{ backgroundColor: d.accent }} aria-hidden="true" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Marquee-moment celebration (SIX / WICKET / FIFTY / HUNDRED) ──────────────

interface Celebration {
  key: string;
  big: string;
  sub: string;
  accent: string;
}

function CelebrationOverlay({ celebration, reduced }: { celebration: Celebration | null; reduced: boolean }) {
  const [shown, setShown] = useState<Celebration | null>(null);
  useEffect(() => {
    if (!celebration) return;
    setShown(celebration);
    const id = window.setTimeout(() => setShown((s) => (s?.key === celebration.key ? null : s)), 2200);
    return () => window.clearTimeout(id);
  }, [celebration]);

  return (
    <AnimatePresence>
      {shown && (
        <m.div
          key={shown.key}
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {!reduced && (
            <m.div
              className="absolute inset-0"
              style={{ background: `radial-gradient(circle at 50% 45%, ${shown.accent}44, transparent 68%)` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.9, 0.12] }}
              transition={{ duration: 1.1, times: [0, 0.18, 1] }}
            />
          )}
          <m.span
            initial={reduced ? { opacity: 0 } : { scale: 0.55, y: 14, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={reduced ? { duration: 0.2 } : { type: "spring", stiffness: 420, damping: 16 }}
            className="score-figures text-[2.6rem] leading-none font-black tracking-tight sm:text-5xl"
            style={{ color: shown.accent, textShadow: `0 2px 24px ${shown.accent}99, 0 1px 2px rgba(0,0,0,0.6)` }}
          >
            {shown.big}
          </m.span>
          {shown.sub && (
            <m.span
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="mt-1.5 rounded-full bg-night/70 px-3 py-0.5 text-xs font-semibold text-ink capitalize backdrop-blur"
            >
              {shown.sub}
            </m.span>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}
