"use client";

/**
 * The Live 3D Stadium (Phase 4, CLAUDE.md §5) — the USP. A react-three-fiber
 * scene that plays every BallEvent as a ~4–6s cinematic reconstruction inside
 * the parametric venue: run-up → release → pitch → shot → golden-trail flight
 * to the synthesized wagon zone → runs / boundary flash / six confetti /
 * wicket mini-scene. Everything is driven by the pure samplers in
 * `choreography.ts`, so the animation is deterministic and test-covered.
 *
 * This module (and its three.js dependency) lives ONLY in the lazy chunk —
 * loaded via `next/dynamic` in `stadium-view.tsx`, never in the initial JS.
 * Performance posture: DPR clamped to 1.5, `frameloop="demand"` when nothing
 * is animating, zero downloaded assets, no shadow maps (blob shadows), no
 * postprocessing. Drei is intentionally omitted: the few features we need
 * (orbit, trail, sprites) are hand-rolled below for a leaner bundle.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { PlayableBall } from "@/components/pitch/pitch-map";
import type { BallEvent, SynthesizedShot } from "@/lib/providers/types";
import {
  ballPositionAt,
  bowlerPositionAt,
  buildScene,
  fieldPoint,
  angleForShot,
  placeFielders,
  runProgressAt,
  seedOf,
  strikerAdvanceAt,
  KEEPER_SPOT,
  PITCH_HALF,
  RUNUP_START_Z,
  type BallScene,
  type FieldGeom,
  type PlacedFielder,
} from "./choreography";
import {
  Player,
  newRig,
  poseBatter,
  poseBowler,
  poseCelebrate,
  poseGather,
  poseIdle,
  poseKeeper,
  poseRun,
  type PlayerRig,
} from "./players";
import { Field, Floodlights, StadiumBowl, Stumps, VenueLandmarks } from "./stadium-ground";
import { venueTheme } from "./venue-theme";
import type { ProjectedActor, StadiumSceneProps } from "./stadium-types";

const HORIZONTAL_BATS: ReadonlySet<SynthesizedShot["shotType"]> = new Set(["cut", "pull", "sweep"]);

function outcomeColor(e: BallEvent, shot: SynthesizedShot): string {
  if (e.wicket) return "#E5484D";
  if (e.runs.batter === 6) return "#8B5CF6";
  if (e.runs.batter === 4) return "#3B82F6";
  if (shot.runsScored > 0) return "#F5B82E";
  return "#93A1B0";
}

interface Playhead {
  key: string | null;
  scene: BallScene | null;
  /** Fielder placement for this ball (computed once with the scene). */
  placement: PlacedFielder[] | null;
  start: number;
}

// ── Camera ───────────────────────────────────────────────────────────────────

function CameraRig({
  preset,
  geom,
  playRef,
  ballPosRef,
}: {
  preset: StadiumSceneProps["preset"];
  geom: FieldGeom;
  playRef: React.MutableRefObject<Playhead>;
  ballPosRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const { camera, gl } = useThree();
  const orbit = useRef({ yaw: 0.85, pitch: 0.5, dist: geom.rz * 1.15 });
  const target = useRef(new THREE.Vector3(0, 1, 2));
  const desired = useMemo(() => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3() }), []);

  // Free-orbit drag + wheel zoom, only wired while the preset is active.
  useEffect(() => {
    if (preset !== "orbit") return;
    const el = gl.domElement;
    const prevTouch = el.style.touchAction;
    el.style.touchAction = "none";
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      orbit.current.yaw -= (e.clientX - lastX) * 0.006;
      orbit.current.pitch = THREE.MathUtils.clamp(orbit.current.pitch + (e.clientY - lastY) * 0.005, 0.12, 1.35);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const up = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.current.dist = THREE.MathUtils.clamp(orbit.current.dist + e.deltaY * 0.08, 16, geom.rz * 2.6);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.style.touchAction = prevTouch;
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [preset, gl, geom.rz]);

  useFrame((_, dt) => {
    const { scene, start } = playRef.current;
    const t = scene ? performance.now() - start : -1;
    if (preset === "orbit") {
      const { yaw, pitch, dist } = orbit.current;
      desired.pos.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      desired.tgt.set(0, 1, 0);
    } else if (preset === "bird") {
      desired.pos.set(0, geom.rz * 1.15 + 12, 0.6);
      desired.tgt.set(0, 0, 0.5);
    } else if (preset === "batter") {
      desired.pos.set(1.8, 2.1, PITCH_HALF + 6.4);
      desired.tgt.set(0, 1.2, -PITCH_HALF);
    } else {
      // Broadcast: elevated behind the bowler's arm; eases toward the ball
      // after contact, then settles back.
      desired.pos.set(0, 11.5, -(PITCH_HALF + 23));
      desired.tgt.set(0, 1.0, PITCH_HALF - 4);
      if (scene && t > scene.tContact && t < scene.tLand + 600) {
        const b = ballPosRef.current;
        desired.tgt.set(b.x * 0.6, Math.min(b.y * 0.5 + 0.8, 7), THREE.MathUtils.clamp(b.z * 0.6, -geom.rz, PITCH_HALF));
      }
    }
    const k = 1 - Math.exp(-dt * 3.4);
    camera.position.lerp(desired.pos, k);
    target.current.lerp(desired.tgt, k);
    camera.lookAt(target.current);
  });
  return null;
}

// ── Ball + golden trail ──────────────────────────────────────────────────────

const TRAIL_N = 26;
const dummy = new THREE.Object3D();

function BallAndTrail({
  playRef,
  ballPosRef,
}: {
  playRef: React.MutableRefObject<Playhead>;
  ballPosRef: React.MutableRefObject<THREE.Vector3>;
}) {
  const ball = useRef<THREE.Mesh>(null);
  const blob = useRef<THREE.Mesh>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const history = useMemo(() => Array.from({ length: TRAIL_N }, () => new THREE.Vector3(0, -5, 0)), []);
  const head = useRef(0);
  const lastKey = useRef<string | null>(null);

  useFrame(() => {
    const { key, scene, start } = playRef.current;
    if (!ball.current || !trail.current || !blob.current) return;
    if (!scene) {
      ball.current.visible = false;
      blob.current.visible = false;
      trail.current.visible = false;
      return;
    }
    if (key !== lastKey.current) {
      lastKey.current = key;
      for (const v of history) v.set(0, -5, 0); // park the old trail below ground
    }
    const t = performance.now() - start;
    const p = ballPositionAt(scene, t);
    ballPosRef.current.set(p.x, p.y, p.z);
    ball.current.visible = true;
    ball.current.position.set(p.x, Math.max(p.y, 0.06), p.z);
    blob.current.visible = p.y < 6;
    blob.current.position.set(p.x, 0.015, p.z);
    const s = Math.max(0.5, 1 - p.y * 0.08);
    blob.current.scale.setScalar(s);

    // Trail: record only while the ball is in flight off the bat/hand.
    if (t > scene.tRelease && t < scene.tLand + 80) {
      history[head.current % TRAIL_N]!.set(p.x, Math.max(p.y, 0.08), p.z);
      head.current += 1;
    }
    trail.current.visible = true;
    for (let i = 0; i < TRAIL_N; i += 1) {
      const idx = (head.current - 1 - i + TRAIL_N * 4) % TRAIL_N;
      const v = history[idx]!;
      dummy.position.copy(v);
      const scale = Math.max(0.09 * (1 - i / TRAIL_N), 0.012);
      dummy.scale.setScalar(v.y < -1 ? 0.0001 : scale);
      dummy.updateMatrix();
      trail.current.setMatrixAt(i, dummy.matrix);
    }
    trail.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <mesh ref={ball}>
        <sphereGeometry args={[0.11, 12, 10]} />
        <meshStandardMaterial color="#FFF3D0" emissive="#F5B82E" emissiveIntensity={2.2} toneMapped={false} roughness={0.3} />
      </mesh>
      <mesh ref={blob} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.16, 10]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <instancedMesh ref={trail} args={[undefined, undefined, TRAIL_N]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#F5B82E" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ── Effects: rope flash, six confetti, wicket pulse ──────────────────────────

function Effects({
  playRef,
  geom,
  crowdMat,
}: {
  playRef: React.MutableRefObject<Playhead>;
  geom: FieldGeom;
  crowdMat: React.MutableRefObject<THREE.MeshStandardMaterial | null>;
}) {
  const rope = useRef<THREE.Mesh>(null);
  const wicketLight = useRef<THREE.PointLight>(null);
  const sixLight = useRef<THREE.PointLight>(null);
  const confetti = useRef<THREE.InstancedMesh>(null);
  const confettiKey = useRef<string | null>(null);
  const bursts = useMemo(() => ({ dirs: [] as { x: number; y: number; z: number; hue: number }[] }), []);
  const baseEmissive = useRef<number | null>(null);

  useFrame(() => {
    const { key, scene, start } = playRef.current;
    const t = scene ? performance.now() - start : -1;

    // FOUR — the rope flashes at the landing arc.
    if (rope.current) {
      const m = rope.current.material as THREE.MeshBasicMaterial;
      const u = scene?.isFour ? (t - scene.tLand) / 700 : -1;
      m.opacity = u >= 0 && u <= 1 ? Math.sin(u * Math.PI) * 0.9 : 0;
      rope.current.visible = m.opacity > 0.01;
    }

    // SIX — crowd flash + confetti burst at the landing stand.
    if (crowdMat.current) {
      if (baseEmissive.current === null) baseEmissive.current = crowdMat.current.emissiveIntensity;
      const u = scene?.isSix ? (t - scene.tLand) / 900 : -1;
      crowdMat.current.emissiveIntensity =
        u >= 0 && u <= 1 ? baseEmissive.current + Math.sin(u * Math.PI) * 1.6 : baseEmissive.current;
    }

    // SIX — a bright gold burst of light at the landing stand.
    if (sixLight.current) {
      const u = scene?.isSix ? (t - scene.tLand) / 900 : -1;
      sixLight.current.intensity = u >= 0 && u <= 1 ? Math.sin(u * Math.PI) * 60 : 0;
      if (scene?.isSix) sixLight.current.position.set(scene.land.x, 6, scene.land.z);
    }
    if (confetti.current) {
      if (scene?.isSix && key !== confettiKey.current) {
        confettiKey.current = key;
        let s = seedOfKey(key ?? "");
        bursts.dirs = Array.from({ length: 70 }, () => {
          s = (s * 1664525 + 1013904223) >>> 0;
          const a = (s % 628) / 100;
          s = (s * 1664525 + 1013904223) >>> 0;
          const up = 0.5 + (s % 100) / 130;
          return { x: Math.cos(a), y: up * 1.6, z: Math.sin(a), hue: s % 2 };
        });
      }
      const u = scene?.isSix ? (t - scene.tLand) / 1150 : -1;
      if (u >= 0 && u <= 1 && scene) {
        confetti.current.visible = true;
        for (let i = 0; i < 70; i += 1) {
          const d = bursts.dirs[i]!;
          dummy.position.set(
            scene.land.x + d.x * u * 9,
            1.5 + d.y * u * 11 - 14 * u * u,
            scene.land.z + d.z * u * 9,
          );
          dummy.rotation.set(u * 9 + i, u * 7, 0);
          dummy.scale.setScalar(0.2 * (1 - u * 0.7));
          dummy.updateMatrix();
          confetti.current.setMatrixAt(i, dummy.matrix);
          confetti.current.setColorAt(i, d.hue === 0 ? GOLD : PURPLE);
        }
        confetti.current.instanceMatrix.needsUpdate = true;
        if (confetti.current.instanceColor) confetti.current.instanceColor.needsUpdate = true;
      } else {
        confetti.current.visible = false;
      }
    }

    // WICKET — a strong red pulse at the striker's stumps (double-throb).
    if (wicketLight.current) {
      const u = scene?.wicketKind ? (t - scene.tLand) / 1100 : -1;
      wicketLight.current.intensity =
        u >= 0 && u <= 1 ? (Math.sin(u * Math.PI) * 0.7 + Math.abs(Math.sin(u * Math.PI * 3)) * 0.3) * 55 : 0;
    }
  });

  return (
    <group>
      <mesh ref={rope} rotation-x={-Math.PI / 2} position-y={0.06} scale={[geom.rx, geom.rz, 1]} visible={false}>
        <ringGeometry args={[0.975, 1, 96]} />
        <meshBasicMaterial color="#3B82F6" transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight ref={wicketLight} position={[0, 1.6, PITCH_HALF]} color="#E5484D" intensity={0} distance={26} />
      <pointLight ref={sixLight} position={[0, 6, 0]} color="#F5B82E" intensity={0} distance={34} />
      <instancedMesh ref={confetti} args={[undefined, undefined, 70]} visible={false} frustumCulled={false}>
        <planeGeometry args={[0.22, 0.22]} />
        <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

const GOLD = new THREE.Color("#F5B82E");
const PURPLE = new THREE.Color("#8B5CF6");

function seedOfKey(key: string): number {
  let h = 88123;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

// ── Wagon landing markers (the innings wheel, in 3D) ─────────────────────────

function WagonDots({ wagon, geom }: { wagon: PlayableBall[]; geom: FieldGeom }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  const CAP = 160;
  useEffect(() => {
    if (!mesh.current) return;
    const shown = wagon.slice(-CAP);
    for (let i = 0; i < CAP; i += 1) {
      const b = shown[i];
      if (b) {
        const p = fieldPoint(angleForShot(b.shot, seedOf(b.event)), Math.max(b.shot.landingRadius, 0.06), geom);
        dummy.position.set(p.x, 0.05, p.z);
        dummy.scale.set(1, 0.35, 1);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.current.setMatrixAt(i, dummy.matrix);
        mesh.current.setColorAt(i, new THREE.Color(outcomeColor(b.event, b.shot)));
      } else {
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        mesh.current.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    invalidate();
  }, [wagon, geom, invalidate]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CAP]} frustumCulled={false}>
      <sphereGeometry args={[0.28, 8, 6]} />
      <meshBasicMaterial transparent opacity={0.8} toneMapped={false} />
    </instancedMesh>
  );
}

// ── The choreography driver: players + stumps, posed per frame ───────────────

const STRIKER_BASE = { x: -0.45, z: PITCH_HALF - 0.5 };
const NONSTRIKER_BASE = { x: 0.55, z: -(PITCH_HALF - 0.7) };

function LiveAction({
  playRef,
  geom,
  battingColor,
  fieldingColor,
  oversPerInnings,
  actorsRef,
}: {
  playRef: React.MutableRefObject<Playhead>;
  geom: FieldGeom;
  battingColor: string;
  fieldingColor: string;
  oversPerInnings: number;
  actorsRef?: React.MutableRefObject<ProjectedActor[]>;
}) {
  const { camera, size } = useThree();
  const projScratch = useMemo(() => new THREE.Vector3(), []);
  const interceptorPos = useRef<{ x: number; z: number } | null>(null);
  const rigs = useMemo(
    () => ({
      bowler: newRig(),
      striker: newRig(),
      nonStriker: newRig(),
      keeper: newRig(),
      fielders: Array.from({ length: 9 }, () => newRig()),
    }),
    [],
  );
  const stumpRefs = useMemo<(THREE.Group | null)[]>(() => [null, null, null], []);
  const idlePlacement = useMemo(() => defaultPlacement(geom, oversPerInnings), [geom, oversPerInnings]);
  const lastPlacement = useRef<PlacedFielder[] | null>(null);

  useFrame(({ clock }) => {
    const tSec = clock.elapsedTime;
    const { scene, start } = playRef.current;
    const t = scene ? performance.now() - start : -1;

    // Between balls the field holds its last shape instead of snapping back.
    if (playRef.current.placement) lastPlacement.current = playRef.current.placement;
    const placement = playRef.current.placement ?? lastPlacement.current ?? idlePlacement;

    // ── Bowler ──
    const bowlerRoot = rigs.bowler.root;
    if (bowlerRoot) {
      if (scene) {
        const p = bowlerPositionAt(scene, t);
        bowlerRoot.position.set(p.x, 0, p.z);
        bowlerRoot.rotation.y = 0; // faces +z (the striker)
        if (scene.wicketKind && t > scene.tLand) poseCelebrate(rigs.bowler, tSec);
        else poseBowler(rigs.bowler, scene.tRelease, t, scene.deliveryType === "spin");
      } else {
        bowlerRoot.position.set(0.4, 0, RUNUP_START_Z);
        poseIdle(rigs.bowler, tSec, 1);
      }
    }

    // ── Batters (stance, swing, advance, running) ──
    const strikerRoot = rigs.striker.root;
    const nonStrikerRoot = rigs.nonStriker.root;
    if (strikerRoot && nonStrikerRoot) {
      const run = scene ? runProgressAt(scene, t) : 0;
      if (scene && run > 0 && run < scene.runs + 0.001) {
        const leg = Math.min(Math.floor(run), scene.runs - 1);
        const frac = Math.min(run - leg, 1);
        const sFrom = leg % 2 === 0 ? STRIKER_BASE.z : NONSTRIKER_BASE.z;
        const sTo = leg % 2 === 0 ? NONSTRIKER_BASE.z : STRIKER_BASE.z;
        const eased = frac < 0.5 ? 2 * frac * frac : 1 - 2 * (1 - frac) * (1 - frac);
        // The non-striker always runs the opposite leg of the striker.
        strikerRoot.position.set(-0.9, 0, THREE.MathUtils.lerp(sFrom, sTo, eased));
        nonStrikerRoot.position.set(0.9, 0, THREE.MathUtils.lerp(sTo, sFrom, eased));
        strikerRoot.rotation.y = sTo < sFrom ? Math.PI : 0;
        nonStrikerRoot.rotation.y = sTo < sFrom ? 0 : Math.PI;
        poseRun(rigs.striker, tSec);
        poseRun(rigs.nonStriker, tSec);
      } else {
        const advance = scene ? strikerAdvanceAt(scene, t) : 0;
        strikerRoot.position.set(STRIKER_BASE.x, 0, STRIKER_BASE.z - advance);
        strikerRoot.rotation.y = Math.PI;
        nonStrikerRoot.position.set(NONSTRIKER_BASE.x, 0, NONSTRIKER_BASE.z);
        nonStrikerRoot.rotation.y = 0;
        if (scene) {
          poseBatter(rigs.striker, scene.tContact, t, {
            swing: scene.swing,
            horizontal: HORIZONTAL_BATS.has(scene.shotType),
            legSide: scene.angle > 0,
            missed: !scene.swing,
          });
        } else {
          poseBatter(rigs.striker, Number.MAX_SAFE_INTEGER, 0, { swing: false, horizontal: false, legSide: false, missed: false });
        }
        poseIdle(rigs.nonStriker, tSec, 2, 0.18);
      }
    }

    // ── Keeper ──
    if (rigs.keeper.root) {
      rigs.keeper.root.position.set(0, 0, KEEPER_SPOT.z);
      rigs.keeper.root.rotation.y = Math.PI;
      const gathering = !!scene && !scene.swing && t > scene.tContact && t < scene.tLand + 500;
      if (scene?.wicketKind === "stumped" && t > scene.tLand) poseCelebrate(rigs.keeper, tSec);
      else poseKeeper(rigs.keeper, tSec, gathering);
    }

    // ── Fielders ──
    interceptorPos.current = null;
    for (let i = 0; i < 9; i += 1) {
      const rig = rigs.fielders[i]!;
      const root = rig.root;
      if (!root) continue;
      const spot = placement[i]?.spot ?? { x: 0, y: 0, z: 20 };
      const isInterceptor = !!scene?.fielder && placement[i]?.position === scene.fielder.position;
      let x = spot.x;
      let z = spot.z;
      if (scene && isInterceptor) {
        // Close the last few meters onto the ball as it arrives.
        const u = THREE.MathUtils.clamp((t - (scene.tLand - 480)) / 480, 0, 1);
        const dx = scene.land.x - spot.x;
        const dz = scene.land.z - spot.z;
        const reach = Math.min(Math.hypot(dx, dz), 3.2);
        const norm = Math.hypot(dx, dz) || 1;
        x += (dx / norm) * reach * u;
        z += (dz / norm) * reach * u;
      }
      root.position.set(x, 0, z);
      if (isInterceptor) interceptorPos.current = { x, z };
      root.rotation.y = Math.atan2(-x, PITCH_HALF - 0.5 - z) + Math.PI; // face the striker
      if (scene && isInterceptor) {
        const u = (t - (scene.tLand - 250)) / 500;
        const catching = scene.wicketKind === "caught" || scene.wicketKind === "caught and bowled";
        if (scene.wicketKind && t > scene.tLand + 260) poseCelebrate(rig, tSec);
        else if (u > 0) poseGather(rig, u, catching);
        else poseIdle(rig, tSec, i, 0.18);
      } else if (scene?.wicketKind && t > scene.tLand + 200) {
        poseCelebrate(rig, tSec + i * 0.3);
      } else {
        poseIdle(rig, tSec, i * 1.7, 0.16);
      }
    }

    // ── Striker-end stumps: explode on bowled / hit wicket ──
    const shatter = scene && (scene.wicketKind === "bowled" || scene.wicketKind === "hit wicket") && t > scene.tLand;
    for (let i = 0; i < 3; i += 1) {
      const g = stumpRefs[i];
      if (!g) continue;
      if (shatter && scene) {
        const u = Math.min((t - scene.tLand) / 750, 1);
        const dir = i - 1 || 0.6;
        g.position.set(dir * u * 0.5, Math.sin(Math.min(u, 1) * Math.PI) * 0.6, u * (1.1 + i * 0.25));
        g.rotation.set(-u * (1.5 + i * 0.6), 0, dir * u * 1.2);
      } else {
        g.position.set(0, 0, 0);
        g.rotation.set(0, 0, 0);
      }
    }

    // ── Project labeled actors to screen space for the HTML overlay ──
    if (actorsRef) {
      const project = (role: ProjectedActor["role"], x: number, z: number, headY = 1.95): ProjectedActor => {
        projScratch.set(x, headY, z).project(camera);
        const onScreen =
          projScratch.z < 1 &&
          projScratch.x >= -1.08 &&
          projScratch.x <= 1.08 &&
          projScratch.y >= -1.08 &&
          projScratch.y <= 1.08;
        return {
          role,
          x: (projScratch.x * 0.5 + 0.5) * size.width,
          y: (-projScratch.y * 0.5 + 0.5) * size.height,
          visible: onScreen,
        };
      };
      const bp = rigs.bowler.root?.position;
      const sp = rigs.striker.root?.position;
      const np = rigs.nonStriker.root?.position;
      const out: ProjectedActor[] = [];
      if (bp) out.push(project("bowler", bp.x, bp.z));
      if (sp) out.push(project("striker", sp.x, sp.z, 2.05));
      if (np) out.push(project("nonStriker", np.x, np.z, 2.05));
      out.push(project("keeper", 0, KEEPER_SPOT.z, 1.7));
      if (interceptorPos.current) out.push(project("fielder", interceptorPos.current.x, interceptorPos.current.z));
      actorsRef.current = out;
    }
  });

  return (
    <group>
      <Player rig={rigs.bowler} kit={fieldingColor} />
      <Player rig={rigs.striker} kit={battingColor} bat />
      <Player rig={rigs.nonStriker} kit={battingColor} bat />
      <Player rig={rigs.keeper} kit={fieldingColor} helmet />
      {rigs.fielders.map((rig, i) => (
        <Player key={i} rig={rig} kit={fieldingColor} />
      ))}
      <Stumps position={[0, 0, PITCH_HALF]} stumpRefs={stumpRefs} />
    </group>
  );
}

/** Idle tableau before the first ball: a mid-innings pace field. */
function defaultPlacement(geom: FieldGeom, oversPerInnings: number): PlacedFielder[] {
  const fake: BallEvent = {
    matchId: "idle", innings: 1, over: Math.floor(oversPerInnings * 0.5), ball: 1,
    bowlerId: "", batterId: "", nonStrikerId: "",
    runs: { batter: 0, extras: 0, total: 0 }, commentaryText: "", timestamp: "",
  };
  const shot: SynthesizedShot = {
    deliveryType: "pace", length: "good", line: "off", shotType: "defend",
    wagonZone: 5, trajectory: "ground", landingRadius: 0.1, runsScored: 0, isBoundary: false, confidence: 1,
  };
  return placeFielders(fake, shot, geom, oversPerInnings);
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function StadiumScene({
  active,
  wagon,
  venue,
  preset,
  battingColor,
  fieldingColor,
  oversPerInnings = 20,
  actorsRef,
}: StadiumSceneProps) {
  const theme = useMemo(() => venueTheme(venue), [venue]);
  const geom: FieldGeom = useMemo(() => ({ rx: theme.rx, rz: theme.rz }), [theme]);
  const night = theme.lighting === "night";

  const playRef = useRef<Playhead>({ key: null, scene: null, placement: null, start: 0 });
  const ballPosRef = useRef(new THREE.Vector3());
  const crowdMat = useRef<THREE.MeshStandardMaterial | null>(null);

  // Rebuild the playhead when a new ball starts (render-time ref write keeps
  // the very first frame in sync — no one-frame flash of the previous scene).
  if (active && active.key !== playRef.current.key) {
    playRef.current = {
      key: active.key,
      scene: buildScene(active.event, active.shot, geom),
      placement: placeFielders(active.event, active.shot, geom, oversPerInnings),
      start: performance.now(),
    };
  } else if (!active && playRef.current.key !== null) {
    playRef.current = { key: null, scene: null, placement: null, start: 0 };
  }

  // Keep frames flowing briefly after a preset change so the camera can ease.
  const [easing, setEasing] = useState(false);
  useEffect(() => {
    setEasing(true);
    const id = window.setTimeout(() => setEasing(false), 1800);
    return () => window.clearTimeout(id);
  }, [preset]);

  const frameloop = active || preset === "orbit" || easing ? "always" : "demand";

  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 1.5]}
      camera={{ fov: 40, near: 0.4, far: 600, position: [0, 11.5, -(PITCH_HALF + 23)] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      style={{ touchAction: preset === "orbit" ? "none" : undefined }}
      aria-label="Live 3D stadium reconstruction"
      role="img"
    >
      <color attach="background" args={[theme.sky]} />
      {/* Fog scales with the venue so the far stands stay readable. */}
      <fog attach="fog" args={[theme.sky, theme.rz * 2.4, theme.rz * 7]} />
      <hemisphereLight args={[theme.glow, "#0A1A10", night ? 0.55 : 0.75]} />
      <directionalLight position={[35, 50, -25]} intensity={night ? 1.25 : 1.6} color={night ? "#EAF0FF" : "#FFF6E3"} />
      <directionalLight position={[-30, 40, 30]} intensity={0.4} color={theme.glow} />
      <Field theme={theme} />
      <StadiumBowl theme={theme} crowdMatRef={crowdMat} />
      <VenueLandmarks theme={theme} />
      <Floodlights theme={theme} />
      <Stumps position={[0, 0, -PITCH_HALF]} />
      <WagonDots wagon={wagon} geom={geom} />
      <LiveAction
        playRef={playRef}
        geom={geom}
        battingColor={battingColor}
        fieldingColor={fieldingColor}
        oversPerInnings={oversPerInnings}
        actorsRef={actorsRef}
      />
      <BallAndTrail playRef={playRef} ballPosRef={ballPosRef} />
      <Effects playRef={playRef} geom={geom} crowdMat={crowdMat} />
      <CameraRig preset={preset} geom={geom} playRef={playRef} ballPosRef={ballPosRef} />
    </Canvas>
  );
}
