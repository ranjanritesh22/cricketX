"use client";

/**
 * Stylized players (Phase 4, CLAUDE.md §5.2, "premium low-poly") — procedural
 * figures built from primitives with a small joint rig the choreography driver
 * poses every frame. This is the upgraded, less-cartoonish build: proper
 * proportions, jointed legs with feet (so the run cycle strides instead of
 * sliding), a neck, a tapered torso, and a batting **helmet with a grille**
 * (fielders/keeper get a cap). Zero asset bytes — still all primitives — but it
 * reads as a person at broadcast distance, not a peg.
 *
 * Six shared "clips" are code, not files: run-up windmill, bat swings, keeper
 * crouch, pickup, catch, celebrate — deterministic and art-directable.
 */
import { useMemo } from "react";
import * as THREE from "three";

export interface PlayerRig {
  root: THREE.Group | null;
  torso: THREE.Group | null;
  armL: THREE.Group | null;
  armR: THREE.Group | null;
  legL: THREE.Group | null;
  legR: THREE.Group | null;
  bat: THREE.Group | null;
}

export function newRig(): PlayerRig {
  return { root: null, torso: null, armL: null, armR: null, legL: null, legR: null, bat: null };
}

// Shared geometries — every player instance reuses these buffers.
const hipGeo = new THREE.SphereGeometry(0.13, 8, 6);
const thighGeo = new THREE.CapsuleGeometry(0.075, 0.24, 3, 6);
const shinGeo = new THREE.CapsuleGeometry(0.058, 0.24, 3, 6);
const shoeGeo = new THREE.BoxGeometry(0.1, 0.07, 0.22);
const torsoGeo = new THREE.CapsuleGeometry(0.155, 0.34, 4, 10);
const chestGeo = new THREE.SphereGeometry(0.17, 10, 8); // upper-chest fill for a fuller torso
const neckGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 6);
const headGeo = new THREE.SphereGeometry(0.108, 12, 10);
const capGeo = new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52);
const peakGeo = new THREE.BoxGeometry(0.16, 0.03, 0.1);
const helmetGeo = new THREE.SphereGeometry(0.128, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.66);
const grilleBarGeo = new THREE.BoxGeometry(0.19, 0.012, 0.012);
const upperArmGeo = new THREE.CapsuleGeometry(0.045, 0.2, 2, 6);
const forearmGeo = new THREE.CapsuleGeometry(0.04, 0.2, 2, 6);
const handGeo = new THREE.SphereGeometry(0.05, 8, 6);
const batBladeGeo = new THREE.BoxGeometry(0.09, 0.58, 0.032);
const batHandleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6);
const shadowGeo = new THREE.CircleGeometry(0.36, 16);

const SKIN = "#B87A54";
const HELMET = "#1B2430";
const TROUSER_TINT = 0.7;

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, opts?: { rough?: number; metal?: number }): THREE.MeshStandardMaterial {
  const key = `${color}:${opts?.rough ?? 0.78}:${opts?.metal ?? 0.05}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts?.rough ?? 0.78, metalness: opts?.metal ?? 0.05 });
    materialCache.set(key, m);
  }
  return m;
}
const skinMat = mat(SKIN, { rough: 0.62 });
const helmetMat = mat(HELMET, { rough: 0.35, metal: 0.25 });
const grilleMat = mat("#2C3644", { rough: 0.3, metal: 0.6 });
const bladeMat = mat("#E8D9B8", { rough: 0.55 });
const handleMat = mat("#20242B", { rough: 0.7 });
const shoeMat = mat("#EEF1F5", { rough: 0.6 });
const shadowMat = new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.26, depthWrite: false });

function darken(hex: string, f: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function Player({ rig, kit, bat = false, helmet = false }: { rig: PlayerRig; kit: string; bat?: boolean; helmet?: boolean }) {
  const trouser = useMemo(() => mat(darken(kit, TROUSER_TINT)), [kit]);
  const shirt = useMemo(() => mat(kit), [kit]);
  const wearsHelmet = helmet || bat;
  return (
    <group ref={(g) => void (rig.root = g)} scale={1.12}>
      <mesh geometry={shadowGeo} material={shadowMat} rotation-x={-Math.PI / 2} position-y={0.012} />

      {/* ── Legs (hip-pivoted, so the run cycle strides) ── */}
      <group ref={(g) => void (rig.legL = g)} position={[-0.085, 0.66, 0]}>
        <mesh geometry={hipGeo} material={trouser} scale={[1, 0.7, 1]} />
        <mesh geometry={thighGeo} material={trouser} position={[0, -0.18, 0]} />
        <mesh geometry={shinGeo} material={trouser} position={[0, -0.44, 0.01]} />
        <mesh geometry={shoeGeo} material={shoeMat} position={[0, -0.62, 0.05]} />
      </group>
      <group ref={(g) => void (rig.legR = g)} position={[0.085, 0.66, 0]}>
        <mesh geometry={hipGeo} material={trouser} scale={[1, 0.7, 1]} />
        <mesh geometry={thighGeo} material={trouser} position={[0, -0.18, 0]} />
        <mesh geometry={shinGeo} material={trouser} position={[0, -0.44, 0.01]} />
        <mesh geometry={shoeGeo} material={shoeMat} position={[0, -0.62, 0.05]} />
      </group>

      {/* ── Torso + head, pivoting at the waist ── */}
      <group ref={(g) => void (rig.torso = g)} position={[0, 0.66, 0]}>
        <mesh geometry={torsoGeo} material={shirt} position={[0, 0.28, 0]} />
        <mesh geometry={chestGeo} material={shirt} position={[0, 0.42, 0.01]} scale={[1, 0.82, 0.8]} />
        <mesh geometry={neckGeo} material={skinMat} position={[0, 0.55, 0]} />
        <mesh geometry={headGeo} material={skinMat} position={[0, 0.68, 0]} />

        {wearsHelmet ? (
          <group position={[0, 0.7, 0]}>
            <mesh geometry={helmetGeo} material={helmetMat} />
            {/* grille: three thin bars across the face */}
            <mesh geometry={grilleBarGeo} material={grilleMat} position={[0, -0.02, 0.108]} scale={[0.55, 1, 1]} />
            <mesh geometry={grilleBarGeo} material={grilleMat} position={[0, -0.06, 0.104]} scale={[0.62, 1, 1]} />
            <mesh geometry={grilleBarGeo} material={grilleMat} position={[0, -0.1, 0.092]} scale={[0.5, 1, 1]} />
          </group>
        ) : (
          <group position={[0, 0.71, 0]}>
            <mesh geometry={capGeo} material={shirt} />
            <mesh geometry={peakGeo} material={shirt} position={[0, -0.02, 0.11]} />
          </group>
        )}

        {/* ── Arms: upper + forearm + hand, pivoting at the shoulder ── */}
        <group ref={(g) => void (rig.armL = g)} position={[-0.2, 0.44, 0]}>
          <mesh geometry={upperArmGeo} material={shirt} position={[0, -0.13, 0]} />
          <mesh geometry={forearmGeo} material={skinMat} position={[0, -0.36, 0]} />
          <mesh geometry={handGeo} material={skinMat} position={[0, -0.5, 0]} />
        </group>
        <group ref={(g) => void (rig.armR = g)} position={[0.2, 0.44, 0]}>
          <mesh geometry={upperArmGeo} material={shirt} position={[0, -0.13, 0]} />
          <mesh geometry={forearmGeo} material={skinMat} position={[0, -0.36, 0]} />
          <mesh geometry={handGeo} material={skinMat} position={[0, -0.5, 0]} />
          {bat && (
            <group ref={(g) => void (rig.bat = g)} position={[0, -0.5, 0.03]}>
              <mesh geometry={batHandleGeo} material={handleMat} position={[0, -0.08, 0]} />
              <mesh geometry={batBladeGeo} material={bladeMat} position={[0, -0.4, 0.02]} rotation-x={0.1} />
            </group>
          )}
        </group>
      </group>
    </group>
  );
}

// ── Pose "clips" — pure mutations, called once per frame ─────────────────────

function ok(
  rig: PlayerRig,
): rig is PlayerRig & { root: THREE.Group; torso: THREE.Group; armL: THREE.Group; armR: THREE.Group } {
  return !!(rig.root && rig.torso && rig.armL && rig.armR);
}

/** Neutral, slightly-apart leg stance (feet under the hips). */
function legsStand(rig: PlayerRig, splay = 0.05): void {
  if (rig.legL) rig.legL.rotation.set(-splay, 0, 0.04);
  if (rig.legR) rig.legR.rotation.set(splay, 0, -0.04);
}

export function poseIdle(rig: PlayerRig, tSec: number, phase = 0, crouch = 0.12): void {
  if (!ok(rig)) return;
  rig.torso.rotation.set(crouch + Math.sin(tSec * 1.2 + phase) * 0.02, 0, 0);
  rig.armL.rotation.set(0.16 + Math.sin(tSec * 1.4 + phase) * 0.04, 0, 0.16);
  rig.armR.rotation.set(0.16 + Math.cos(tSec * 1.3 + phase) * 0.04, 0, -0.16);
  legsStand(rig, 0.06 + Math.sin(tSec * 1.2 + phase) * 0.01);
}

/** Run-up arm pump → over-the-top windmill at release → follow-through. */
export function poseBowler(rig: PlayerRig, tRelease: number, t: number, spin: boolean): void {
  if (!ok(rig)) return;
  const windup = tRelease - 380;
  if (t < windup) {
    const swing = Math.sin(t * 0.016) * 0.75;
    rig.torso.rotation.set(0.2, 0, 0);
    rig.armL.rotation.set(swing, 0, 0.12);
    rig.armR.rotation.set(-swing, 0, -0.12);
    // Legs drive the run-up in the opposite phase to the arms.
    if (rig.legL) rig.legL.rotation.set(-swing * 0.9, 0, 0.04);
    if (rig.legR) rig.legR.rotation.set(swing * 0.9, 0, -0.04);
    return;
  }
  const u = Math.min((t - windup) / (spin ? 640 : 560), 1);
  const arc = spin ? 4.6 : 5.6; // spinners roll it over a touch slower
  rig.torso.rotation.set(0.2 + u * 0.4, -0.25 * u, 0);
  rig.armR.rotation.set(0.6 - u * arc, 0, -0.15);
  rig.armL.rotation.set(0.4 - u * 1.4, 0, 0.3);
  // Front-foot brace at the crease.
  if (rig.legL) rig.legL.rotation.set(-0.5 + u * 0.2, 0, 0.05);
  if (rig.legR) rig.legR.rotation.set(0.7 - u * 0.9, 0, -0.05);
}

/** Batting stance → shot-shaped swing around contact. */
export function poseBatter(
  rig: PlayerRig,
  tContact: number,
  t: number,
  opts: { swing: boolean; horizontal: boolean; legSide: boolean; missed: boolean },
): void {
  if (!ok(rig)) return;
  // Side-on stance: feet slightly split.
  if (rig.legL) rig.legL.rotation.set(-0.14, 0, 0.05);
  if (rig.legR) rig.legR.rotation.set(0.12, 0, -0.05);
  const u = Math.min(Math.max((t - (tContact - 140)) / 320, 0), 1);
  const amp = opts.missed ? 0.9 : opts.swing ? 1 : 0.25;
  const stanceX = 0.28;
  if (u <= 0) {
    rig.torso.rotation.set(stanceX, 0, 0);
    rig.armL.rotation.set(0.9, 0.25, 0.35);
    rig.armR.rotation.set(0.9, -0.15, -0.2);
    if (rig.bat) rig.bat.rotation.set(0.25, 0, 0);
    return;
  }
  const sweep = Math.sin(u * Math.PI);
  const side = opts.legSide ? 1 : -1;
  if (opts.horizontal) {
    // Cut / pull / sweep family: torso twist drives a flat bat path.
    rig.torso.rotation.set(stanceX + 0.12 * sweep, side * 1.05 * sweep * amp, 0);
    rig.armR.rotation.set(0.9 - 1.5 * sweep * amp, 0, -0.5 * sweep);
    rig.armL.rotation.set(0.9 - 1.1 * sweep * amp, 0, 0.35);
    if (rig.legR) rig.legR.rotation.set(0.12 + 0.3 * sweep, 0, -0.05); // pivot on the back foot
  } else {
    // Vertical bat: drive / defend / loft.
    rig.torso.rotation.set(stanceX - 0.18 * sweep, side * 0.35 * sweep * amp, 0);
    rig.armR.rotation.set(0.9 - 2.1 * sweep * amp, 0, -0.15);
    rig.armL.rotation.set(0.9 - 1.9 * sweep * amp, 0, 0.25);
    if (rig.legL) rig.legL.rotation.set(-0.14 - 0.28 * sweep, 0, 0.05); // front-foot stride
  }
  if (rig.bat) rig.bat.rotation.set(0.25 - 1.2 * sweep * amp, 0, 0);
}

export function poseKeeper(rig: PlayerRig, tSec: number, gathering: boolean): void {
  if (!ok(rig)) return;
  // Deep squat: knees bent hard.
  if (rig.legL) rig.legL.rotation.set(-0.9, 0, 0.08);
  if (rig.legR) rig.legR.rotation.set(-0.9, 0, -0.08);
  if (gathering) {
    rig.torso.rotation.set(0.85, 0, 0);
    rig.armL.rotation.set(-1.15, 0, 0.2);
    rig.armR.rotation.set(-1.15, 0, -0.2);
    return;
  }
  rig.torso.rotation.set(0.7 + Math.sin(tSec * 1.1) * 0.02, 0, 0);
  rig.armL.rotation.set(-0.5, 0, 0.3);
  rig.armR.rotation.set(-0.5, 0, -0.3);
}

/** Interceptor gather: crouch to pick up (ground) or arms up (catch). */
export function poseGather(rig: PlayerRig, u: number, catching: boolean): void {
  if (!ok(rig)) return;
  const k = Math.sin(Math.min(u, 1) * Math.PI);
  if (catching) {
    rig.torso.rotation.set(0.1 - 0.1 * k, 0, 0);
    rig.armL.rotation.set(0.18 - 3.1 * k, 0, 0.25);
    rig.armR.rotation.set(0.18 - 3.1 * k, 0, -0.25);
    legsStand(rig, 0.14);
  } else {
    rig.torso.rotation.set(0.12 + 0.85 * k, 0, 0);
    rig.armL.rotation.set(0.18 - 1.3 * k, 0, 0.15);
    rig.armR.rotation.set(0.18 - 1.3 * k, 0, -0.15);
    if (rig.legL) rig.legL.rotation.set(-0.1 - 0.5 * k, 0, 0.05);
    if (rig.legR) rig.legR.rotation.set(0.1 + 0.3 * k, 0, -0.05);
  }
}

export function poseCelebrate(rig: PlayerRig, tSec: number): void {
  if (!ok(rig)) return;
  const bounce = Math.abs(Math.sin(tSec * 5));
  rig.torso.rotation.set(-0.16, 0, 0);
  rig.armL.rotation.set(Math.PI * 0.92, 0, 0.35 + bounce * 0.15);
  rig.armR.rotation.set(Math.PI * 0.92, 0, -0.35 - bounce * 0.15);
  // Little hops.
  if (rig.legL) rig.legL.rotation.set(-0.1 - bounce * 0.2, 0, 0.05);
  if (rig.legR) rig.legR.rotation.set(-0.1 - bounce * 0.2, 0, -0.05);
  if (rig.root) rig.root.position.y = bounce * 0.06;
}

/** Running lean + arm drive + striding legs for shuttling batters. */
export function poseRun(rig: PlayerRig, tSec: number): void {
  if (!ok(rig)) return;
  const cycle = Math.sin(tSec * 11);
  rig.torso.rotation.set(0.4, 0, 0);
  rig.armL.rotation.set(cycle * 0.95, 0, 0.15);
  rig.armR.rotation.set(-cycle * 0.95, 0, -0.15);
  // Legs stride opposite the arms; the little vertical bob sells the gait.
  if (rig.legL) rig.legL.rotation.set(-cycle * 0.85, 0, 0.05);
  if (rig.legR) rig.legR.rotation.set(cycle * 0.85, 0, -0.05);
  if (rig.root) rig.root.position.y = Math.abs(cycle) * 0.04;
  if (rig.bat) rig.bat.rotation.set(1.3, 0, 0);
}
