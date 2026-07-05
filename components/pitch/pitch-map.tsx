"use client";

/**
 * The 2D top-down pitch map (Phase 3, CLAUDE.md §10) — the FotMob-style field
 * that consumes `SynthesizedShot`s. The golden ball-trail is the signature
 * visual: a delivery slides from the bowler's end, the trail draws out to the
 * parsed wagon zone × radius, boundaries flash the rope, sixes burst in the
 * stands, and every scoring shot accumulates into the innings wagon wheel.
 *
 * Pure SVG + Motion — no canvas, no physics, deterministic and cheap. This is
 * also the permanent fallback under the Phase-4 3D stadium (low-end devices
 * and `prefers-reduced-motion`).
 */
import { m } from "motion/react";
import { useMemo } from "react";
import type { BallEvent, SynthesizedShot } from "@/lib/providers/types";
import { FIELD_SPOTS, zoneOfAngle } from "@/lib/synth";
import { outcomeColor, shotAngle, shotSeed } from "@/lib/synth/scene";

export { outcomeColor };

export interface PlayableBall {
  /** Stable identity — over.ball + timestamp (wides reuse ball numbers). */
  key: string;
  event: BallEvent;
  shot: SynthesizedShot;
}

// ── Field geometry (viewBox 480×320) ─────────────────────────────────────────
const CX = 240;
const CY = 158;
const RX = 220; // boundary ellipse
const RY = 136;
const ORIGIN = { x: 240, y: 184 }; // striker's stumps — wagon wheel origin
const BOWLER = { x: 240, y: 116 }; // release point

/** Landing point for a synth angle (deg, 0 = straight, +leg/−off for RH) and 0..1 radius. */
function landingPoint(angle: number, frac: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  const dx = -Math.sin(rad);
  const dy = -Math.cos(rad);
  // Distance from the origin to the boundary ellipse along (dx, dy).
  const px = (ORIGIN.x - CX) / RX;
  const py = (ORIGIN.y - CY) / RY;
  const qx = dx / RX;
  const qy = dy / RY;
  const a = qx * qx + qy * qy;
  const b = 2 * (px * qx + py * qy);
  const c = px * px + py * py - 1;
  const t = (-b + Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
  return { x: ORIGIN.x + dx * t * frac, y: ORIGIN.y + dy * t * frac };
}

/** Total playback time for one ball — the panel schedules the queue off this. */
export function playbackMillis(shot: SynthesizedShot): number {
  const flight =
    shot.trajectory === "skier" ? 1700 : shot.trajectory === "lofted" ? 1400 : shot.trajectory === "flat" ? 750 : 950;
  return 350 + flight + 900; // delivery + flight + hold for the pill/burst
}

interface Scene {
  angle: number;
  land: { x: number; y: number };
  path: string;
  samples: { xs: number[]; ys: number[] };
  color: string;
  flightSec: number;
}

function sceneFor(ball: PlayableBall): Scene {
  const seed = shotSeed(ball.event);
  const angle = shotAngle(ball.shot, seed);
  const land = landingPoint(angle, Math.max(ball.shot.landingRadius, 0.04));
  // Quadratic trail: gentle curvature for ground balls, a visible bow for lofted.
  const mx = (ORIGIN.x + land.x) / 2;
  const my = (ORIGIN.y + land.y) / 2;
  const len = Math.hypot(land.x - ORIGIN.x, land.y - ORIGIN.y) || 1;
  const bow =
    ball.shot.trajectory === "skier" ? 0.3 : ball.shot.trajectory === "lofted" ? 0.18 : ball.shot.trajectory === "flat" ? 0.08 : 0.05;
  const sign = seed % 2 === 0 ? 1 : -1;
  const cx = mx + (-(land.y - ORIGIN.y) / len) * len * bow * sign;
  const cy = my + ((land.x - ORIGIN.x) / len) * len * bow * sign;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    xs.push((1 - t) * (1 - t) * ORIGIN.x + 2 * (1 - t) * t * cx + t * t * land.x);
    ys.push((1 - t) * (1 - t) * ORIGIN.y + 2 * (1 - t) * t * cy + t * t * land.y);
  }
  const flight = playbackMillis(ball.shot) - 350 - 900;
  return {
    angle,
    land,
    path: `M ${ORIGIN.x} ${ORIGIN.y} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${land.x.toFixed(1)} ${land.y.toFixed(1)}`,
    samples: { xs, ys },
    color: outcomeColor(ball.event, ball.shot),
    flightSec: flight / 1000,
  };
}

/** Ball size over the flight — top-down "height" is sold with scale. */
function radiusKeyframes(trajectory: SynthesizedShot["trajectory"]): number[] {
  if (trajectory === "skier") return [2.6, 6.5, 6.8, 3];
  if (trajectory === "lofted") return [2.6, 5.2, 5.2, 3];
  if (trajectory === "flat") return [2.6, 3.4, 2.8];
  return [2.6, 2.8, 2.4];
}

const MOW_RINGS = [52, 96, 140, 184];

function FieldSurface() {
  return (
    <>
      {/* Stadium bowl + floodlight wash */}
      <ellipse cx={CX} cy={CY} rx={236} ry={150} fill="#0D1219" stroke="#1F2831" strokeWidth="2" />
      <ellipse cx={CX} cy={CY} rx={236} ry={150} fill="url(#px-floodlight)" />
      {/* Outfield with circular mow rings */}
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="url(#px-turf)" />
      {MOW_RINGS.map((r) => (
        <ellipse
          key={r}
          cx={CX}
          cy={CY}
          rx={r}
          ry={(r * RY) / RX}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.035"
          strokeWidth={18}
        />
      ))}
      {/* Boundary rope */}
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="#E7EDF3" strokeOpacity="0.22" strokeWidth="1.8" />
      {/* 30-yard circle */}
      <ellipse cx={CX} cy={150} rx={112} ry={66} fill="none" stroke="#2E4A36" strokeWidth="1.4" strokeDasharray="5 6" />
      {/* Pitch */}
      <rect x={231} y={110} width={18} height={80} rx={2.5} fill="url(#px-pitch)" />
      <line x1={233} y1={118} x2={247} y2={118} stroke="#F5EFE2" strokeOpacity="0.5" strokeWidth="1" />
      <line x1={233} y1={182} x2={247} y2={182} stroke="#F5EFE2" strokeOpacity="0.5" strokeWidth="1" />
      {/* Stumps + keeper */}
      <circle cx={BOWLER.x} cy={112} r={1.6} fill="#E7EDF3" opacity={0.7} />
      <circle cx={ORIGIN.x} cy={188} r={1.6} fill="#E7EDF3" opacity={0.7} />
      <circle cx={240} cy={198} r={2} fill="#93A1B0" opacity={0.45} />
    </>
  );
}

function WagonLine({ ball }: { ball: PlayableBall }) {
  const scene = sceneFor(ball);
  const boundary = ball.shot.isBoundary;
  return (
    <g>
      <path
        d={scene.path}
        fill="none"
        stroke={scene.color}
        strokeOpacity={boundary ? 0.62 : 0.4}
        strokeWidth={boundary ? 1.9 : 1.3}
        strokeLinecap="round"
      />
      <circle cx={scene.land.x} cy={scene.land.y} r={boundary ? 2.4 : 1.7} fill={scene.color} fillOpacity={0.75} />
    </g>
  );
}

function ActiveBall({ ball, reduced }: { ball: PlayableBall; reduced: boolean }) {
  const scene = sceneFor(ball);
  const { shot, event } = ball;
  const runs = Math.min(shot.runsScored, 3);
  const fielderSpot = shot.fielderRole
    ? landingPoint(
        zoneOfAngle(FIELD_SPOTS[shot.fielderRole].angle) === shot.wagonZone
          ? FIELD_SPOTS[shot.fielderRole].angle
          : -FIELD_SPOTS[shot.fielderRole].angle,
        FIELD_SPOTS[shot.fielderRole].radius,
      )
    : null;

  if (reduced) {
    // Static scene: trail + landing dot, no tweens (prefers-reduced-motion).
    return (
      <g>
        <path d={scene.path} fill="none" stroke={`url(#px-trail-${ball.key})`} strokeWidth={3} strokeLinecap="round" />
        <circle cx={scene.land.x} cy={scene.land.y} r={3.2} fill={scene.color} />
        <TrailGradient id={`px-trail-${ball.key}`} scene={scene} />
      </g>
    );
  }

  const flightDelay = 0.35;
  const arrive = flightDelay + scene.flightSec;

  return (
    <g>
      <TrailGradient id={`px-trail-${ball.key}`} scene={scene} />
      {/* Named fielder lights up where the ball is headed */}
      {fielderSpot && (
        <m.circle
          cx={fielderSpot.x}
          cy={fielderSpot.y}
          r={3}
          fill="none"
          stroke="#E7EDF3"
          strokeWidth={1}
          initial={{ opacity: 0.25, scale: 1 }}
          animate={{ opacity: [0.25, 0.9, 0.4], scale: [1, 1.5, 1] }}
          transition={{ delay: arrive - 0.25, duration: 0.6 }}
          style={{ transformOrigin: `${fielderSpot.x}px ${fielderSpot.y}px` }}
        />
      )}
      {/* 1 — the delivery slides down the pitch */}
      <m.circle
        r={2.4}
        fill="#F8FAFC"
        initial={{ cx: BOWLER.x, cy: BOWLER.y, opacity: 0 }}
        animate={{ cx: ORIGIN.x, cy: [BOWLER.y, ORIGIN.y], opacity: [0, 1, 1] }}
        transition={{ duration: flightDelay, ease: "easeIn" }}
      />
      {/* 2 — the golden trail draws to the wagon zone */}
      <m.path
        d={scene.path}
        fill="none"
        stroke={`url(#px-trail-${ball.key})`}
        strokeWidth={3.2}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: flightDelay, duration: scene.flightSec, ease: shot.trajectory === "ground" ? "easeOut" : "easeInOut" }}
      />
      {/* 3 — the ball rides the trail; scale sells the height */}
      <m.circle
        fill={scene.color}
        initial={{ cx: ORIGIN.x, cy: ORIGIN.y, r: 2.6 }}
        animate={{ cx: scene.samples.xs, cy: scene.samples.ys, r: radiusKeyframes(shot.trajectory) }}
        transition={{ delay: flightDelay, duration: scene.flightSec, ease: shot.trajectory === "ground" ? "easeOut" : "easeInOut" }}
      />
      {/* 4 — outcome flourishes */}
      {event.runs.batter === 4 && (
        <m.ellipse
          cx={CX}
          cy={CY}
          rx={RX}
          ry={RY}
          fill="none"
          stroke="#3B82F6"
          strokeWidth={2.5}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.85, 0] }}
          transition={{ delay: arrive, duration: 0.7 }}
        />
      )}
      {event.runs.batter === 6 && (
        <>
          <m.circle
            cx={scene.land.x}
            cy={scene.land.y}
            r={4}
            fill="none"
            stroke="#8B5CF6"
            strokeWidth={2}
            initial={{ opacity: 0.9, scale: 0.4 }}
            animate={{ opacity: 0, scale: 5 }}
            transition={{ delay: arrive, duration: 0.8, ease: "easeOut" }}
            style={{ transformOrigin: `${scene.land.x}px ${scene.land.y}px` }}
          />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <m.circle
              key={deg}
              r={1.6}
              fill={deg % 90 === 0 ? "#F5B82E" : "#8B5CF6"}
              initial={{ cx: scene.land.x, cy: scene.land.y, opacity: 1 }}
              animate={{
                cx: scene.land.x + Math.cos((deg * Math.PI) / 180) * 16,
                cy: scene.land.y + Math.sin((deg * Math.PI) / 180) * 16,
                opacity: 0,
              }}
              transition={{ delay: arrive, duration: 0.65, ease: "easeOut" }}
            />
          ))}
        </>
      )}
      {event.wicket && (
        <m.circle
          cx={ORIGIN.x}
          cy={ORIGIN.y}
          r={5}
          fill="none"
          stroke="#E5484D"
          strokeWidth={2.5}
          initial={{ opacity: 1, scale: 0.3 }}
          animate={{ opacity: 0, scale: 3.4 }}
          transition={{ delay: arrive, duration: 0.9, ease: "easeOut" }}
          style={{ transformOrigin: `${ORIGIN.x}px ${ORIGIN.y}px` }}
        />
      )}
      {/* 5 — batters shuttle the runs */}
      {runs > 0 && !shot.isBoundary && !event.wicket && (
        <m.circle
          cx={228}
          r={1.8}
          fill="#E7EDF3"
          opacity={0.65}
          initial={{ cy: 184 }}
          animate={{ cy: 116 }}
          transition={{ delay: flightDelay, duration: 0.45, repeat: runs - 1, repeatType: "reverse" }}
        />
      )}
    </g>
  );
}

function TrailGradient({ id, scene }: { id: string; scene: Scene }) {
  return (
    <defs>
      <linearGradient
        id={id}
        gradientUnits="userSpaceOnUse"
        x1={ORIGIN.x}
        y1={ORIGIN.y}
        x2={scene.land.x}
        y2={scene.land.y}
      >
        <stop offset="0" stopColor={scene.color} stopOpacity="0" />
        <stop offset="0.55" stopColor="#F5B82E" stopOpacity="0.7" />
        <stop offset="1" stopColor={scene.color} />
      </linearGradient>
    </defs>
  );
}

export function PitchMap({
  wagon,
  active,
  reduced,
}: {
  /** Accumulated scoring shots for the innings on display (oldest → newest). */
  wagon: PlayableBall[];
  /** The ball currently being reconstructed, if any. */
  active: PlayableBall | null;
  reduced: boolean;
}) {
  const staticLines = useMemo(() => wagon.filter((b) => b.key !== active?.key), [wagon, active?.key]);

  return (
    <svg viewBox="0 0 480 320" className="h-auto w-full" role="img" aria-label="Live reconstruction pitch map">
      <defs>
        <radialGradient id="px-turf" cx="50%" cy="46%" r="62%">
          <stop offset="0%" stopColor="#1A3A24" />
          <stop offset="72%" stopColor="#132B1A" />
          <stop offset="100%" stopColor="#0E2013" />
        </radialGradient>
        <radialGradient id="px-floodlight" cx="50%" cy="0%" r="85%">
          <stop offset="0%" stopColor="#F5B82E" stopOpacity="0.07" />
          <stop offset="55%" stopColor="#F5B82E" stopOpacity="0.015" />
          <stop offset="100%" stopColor="#F5B82E" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="px-pitch" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7A5E33" />
          <stop offset="0.5" stopColor="#96773F" />
          <stop offset="1" stopColor="#7A5E33" />
        </linearGradient>
      </defs>
      <FieldSurface />
      <g>
        {staticLines.map((ball) => (
          <WagonLine key={ball.key} ball={ball} />
        ))}
      </g>
      {active && <ActiveBall key={active.key} ball={active} reduced={reduced} />}
    </svg>
  );
}
