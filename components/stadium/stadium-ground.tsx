"use client";

/**
 * The parametric stadium (Phase 4, CLAUDE.md §5.2) — ONE base model, skinned
 * per venue by `venueTheme`: boundary ellipse, two seating tiers, roof band,
 * floodlight towers, sight screens, pitch. All geometry is procedural and all
 * textures are painted into small runtime canvases (crowd speckle, mown
 * outfield) — total downloaded 3D assets: 0 bytes.
 */
import { useMemo } from "react";
import * as THREE from "three";
import type { VenueTheme } from "./venue-theme";
import { PITCH_HALF } from "./choreography";

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Seeded PRNG so the crowd speckle is stable frame to frame. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useCrowdTexture(theme: VenueTheme): THREE.CanvasTexture {
  return useMemo(() => {
    const tex = canvasTexture(256, 128, (ctx) => {
      ctx.fillStyle = theme.standLower;
      ctx.fillRect(0, 0, 256, 128);
      const rand = mulberry32(7);
      for (let row = 0; row < 10; row += 1) {
        for (let i = 0; i < 88; i += 1) {
          ctx.fillStyle = theme.crowd[Math.floor(rand() * theme.crowd.length)]!;
          const x = i * 2.9 + rand() * 2;
          const y = 8 + row * 12 + rand() * 3;
          ctx.fillRect(x, y, 1.7, 1.7);
        }
      }
    });
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(12, 1);
    return tex;
  }, [theme]);
}

function useGrassTexture(): THREE.CanvasTexture {
  return useMemo(
    () =>
      canvasTexture(1024, 1024, (ctx) => {
        const g = ctx.createRadialGradient(512, 512, 60, 512, 512, 512);
        g.addColorStop(0, "#1E4229");
        g.addColorStop(0.72, "#16311E");
        g.addColorStop(1, "#102616");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 1024, 1024);
        // Circular mow rings.
        for (let r = 90; r < 512; r += 52) {
          ctx.beginPath();
          ctx.arc(512, 512, r, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255,255,255,0.028)";
          ctx.lineWidth = 26;
          ctx.stroke();
        }
      }),
    [],
  );
}

export function Field({ theme }: { theme: VenueTheme }) {
  const grass = useGrassTexture();
  const rimX = theme.rx + 7;
  const rimZ = theme.rz + 7;
  return (
    <group>
      {/* Outfield (extends a rope's-width past the boundary to the bowl base) */}
      <mesh rotation-x={-Math.PI / 2} scale={[rimX, rimZ, 1]}>
        <circleGeometry args={[1, 72]} />
        <meshStandardMaterial map={grass} roughness={1} metalness={0} />
      </mesh>
      {/* Boundary rope */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.03} scale={[theme.rx, theme.rz, 1]}>
        <ringGeometry args={[0.992, 1, 96]} />
        <meshBasicMaterial color="#E7EDF3" transparent opacity={0.55} />
      </mesh>
      {/* 30-yard circle */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} scale={[27.4, 25, 1]}>
        <ringGeometry args={[0.985, 1, 72]} />
        <meshBasicMaterial color="#DDE6EE" transparent opacity={0.14} />
      </mesh>
      {/* Pitch + popping creases */}
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[3.05, 0.045, PITCH_HALF * 2 + 0.6]} />
        <meshStandardMaterial color="#8C7647" roughness={0.95} />
      </mesh>
      {[PITCH_HALF - 1.22, -(PITCH_HALF - 1.22)].map((z) => (
        <mesh key={z} position={[0, 0.05, z]}>
          <boxGeometry args={[3.4, 0.012, 0.07]} />
          <meshBasicMaterial color="#F2EDE0" />
        </mesh>
      ))}
    </group>
  );
}

export function Stumps({
  position,
  stumpRefs,
}: {
  position: [number, number, number];
  /** When provided, each stump group is registered for wicket animation. */
  stumpRefs?: (THREE.Group | null)[];
}) {
  return (
    <group position={position}>
      {[-0.11, 0, 0.11].map((x, i) => (
        <group key={x} position={[x, 0, 0]} ref={stumpRefs ? (g) => void (stumpRefs[i] = g) : undefined}>
          <mesh position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.024, 0.024, 0.72, 6]} />
            <meshStandardMaterial color="#EAE0C8" roughness={0.5} emissive="#EAE0C8" emissiveIntensity={0.12} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function StadiumBowl({
  theme,
  crowdMatRef,
}: {
  theme: VenueTheme;
  /** Lower-tier material — the six celebration pulses its emissive. */
  crowdMatRef?: React.MutableRefObject<THREE.MeshStandardMaterial | null>;
}) {
  const crowd = useCrowdTexture(theme);
  const sx = theme.rx + 9;
  const sz = theme.rz + 9;
  const night = theme.lighting === "night";
  return (
    <group>
      {/* Perimeter fence between rope and stands */}
      <mesh position-y={0.6} scale={[sx, 1, sz]}>
        <cylinderGeometry args={[1.002, 1.002, 1.2, 64, 1, true]} />
        <meshStandardMaterial color="#0C1118" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      {/* Lower seating tier */}
      <mesh position-y={5.4} scale={[sx, 1, sz]}>
        <cylinderGeometry args={[1.17, 1.005, 9.6, 64, 1, true]} />
        <meshStandardMaterial
          ref={(m) => {
            if (crowdMatRef) crowdMatRef.current = m;
          }}
          map={crowd}
          color="#FFFFFF"
          emissive={theme.standLower}
          emissiveIntensity={night ? 0.35 : 0.1}
          side={THREE.DoubleSide}
          roughness={1}
        />
      </mesh>
      {/* Upper tier */}
      <mesh position-y={13.6} scale={[sx, 1, sz]}>
        <cylinderGeometry args={[1.31, 1.18, 7.6, 64, 1, true]} />
        <meshStandardMaterial
          map={crowd}
          color="#C9CFD8"
          emissive={theme.standUpper}
          emissiveIntensity={night ? 0.3 : 0.08}
          side={THREE.DoubleSide}
          roughness={1}
        />
      </mesh>
      {/* Roof band */}
      <mesh position-y={18.3} scale={[sx, 1, sz]}>
        <cylinderGeometry args={[1.36, 1.3, 1.6, 64, 1, true]} />
        <meshStandardMaterial
          color={theme.roof}
          emissive={theme.roof}
          emissiveIntensity={night ? 0.22 : 0.05}
          side={THREE.DoubleSide}
          roughness={0.6}
        />
      </mesh>
      {/* Sight screens behind each end */}
      {[theme.rz + 2.5, -(theme.rz + 2.5)].map((z) => (
        <mesh key={z} position={[0, 2.2, z]}>
          <boxGeometry args={[9, 4.4, 0.5]} />
          <meshStandardMaterial
            color={night ? "#11161D" : "#EDEFF2"}
            emissive={night ? "#0A0E13" : "#FFFFFF"}
            emissiveIntensity={night ? 0.4 : 0.15}
            roughness={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Signature per-venue architecture (CLAUDE.md §5.2). The generic bowl gets
 * iconic structures behind the boundary so a Lord's match reads as Lord's:
 * the brick Pavilion at one end, the white cantilevered Media Centre pod at
 * the other, plus a lit scoreboard every ground shares. Still 0 asset bytes.
 */
export function VenueLandmarks({ theme }: { theme: VenueTheme }) {
  const night = theme.lighting === "night";
  const zEnd = theme.rz + 7.5;
  const l = theme.landmarks;
  return (
    <group>
      {/* Pavilion — Victorian brick grandstand at the far (bowler's) end */}
      {l?.pavilion && (
        <group position={[0, 0, -zEnd]}>
          <mesh position={[0, 8, 0]}>
            <boxGeometry args={[30, 16, 4]} />
            <meshStandardMaterial color={l.pavilion} roughness={0.9} />
          </mesh>
          {/* pale terrace tiers facing the field */}
          <mesh position={[0, 6.5, 2.1]}>
            <boxGeometry args={[26, 11, 0.6]} />
            <meshStandardMaterial color={l.grandstand ?? "#E8E2D2"} roughness={0.85} emissive={l.grandstand ?? "#E8E2D2"} emissiveIntensity={night ? 0.16 : 0.05} />
          </mesh>
          {/* twin gables + roofline */}
          {[-9, 9].map((x) => (
            <mesh key={x} position={[x, 17, 1]} rotation-z={Math.PI / 4}>
              <boxGeometry args={[5, 5, 4.4]} />
              <meshStandardMaterial color={l.grandstand ?? "#EDE7D6"} roughness={0.8} />
            </mesh>
          ))}
          {/* clock */}
          <mesh position={[0, 15.5, 2.2]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[1.1, 1.1, 0.3, 16]} />
            <meshStandardMaterial color="#12305A" emissive="#12305A" emissiveIntensity={0.3} />
          </mesh>
        </group>
      )}

      {/* Media Centre — the white cantilevered pod opposite the pavilion */}
      {l?.mediaPod && (
        <group position={[0, 0, zEnd]}>
          {/* two support columns */}
          {[-4.5, 4.5].map((x) => (
            <mesh key={x} position={[x, 6, 0.4]}>
              <cylinderGeometry args={[0.8, 0.9, 12, 12]} />
              <meshStandardMaterial color="#DFE4EA" roughness={0.5} />
            </mesh>
          ))}
          {/* the pod: a smooth white aluminium capsule … */}
          <mesh position={[0, 13, 0]} scale={[1, 0.56, 0.78]}>
            <sphereGeometry args={[7.2, 28, 18]} />
            <meshStandardMaterial color="#F4F7FA" roughness={0.3} metalness={0.12} emissive="#EAF0F6" emissiveIntensity={night ? 0.28 : 0.12} />
          </mesh>
          {/* … with a slim dark glass window facing the pitch */}
          <mesh position={[0, 12.9, -5.1]} scale={[1, 0.28, 0.55]}>
            <sphereGeometry args={[6.6, 28, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.2]} />
            <meshStandardMaterial color="#16212E" roughness={0.12} metalness={0.55} />
          </mesh>
        </group>
      )}

      {/* Scoreboard — a lit panel every ground shares, square of the wicket */}
      <group position={[theme.rx + 8.5, 0, 7]} rotation-y={-Math.PI / 2.4}>
        <mesh position={[0, 9, 0]}>
          <boxGeometry args={[0.8, 18, 0.8]} />
          <meshStandardMaterial color="#1A222C" roughness={0.7} />
        </mesh>
        <mesh position={[0, 15, 0.5]}>
          <boxGeometry args={[9, 5.4, 0.4]} />
          <meshStandardMaterial color="#0A0E13" emissive={theme.glow} emissiveIntensity={night ? 0.7 : 0.35} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

const glowTexture = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    tex = canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, "rgba(255,246,214,0.9)");
      g.addColorStop(0.35, "rgba(255,240,190,0.28)");
      g.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
    return tex;
  };
})();

export function Floodlights({ theme }: { theme: VenueTheme }) {
  const night = theme.lighting === "night";
  const towers = useMemo(() => {
    const rx = theme.rx + 16;
    const rz = theme.rz + 16;
    return [45, 135, 225, 315].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return { x: Math.cos(rad) * rx, z: Math.sin(rad) * rz, yaw: Math.atan2(Math.cos(rad) * rx, Math.sin(rad) * rz) };
    });
  }, [theme]);
  return (
    <group>
      {towers.map((tw, i) => (
        <group key={i} position={[tw.x, 0, tw.z]} rotation-y={tw.yaw + Math.PI}>
          <mesh position-y={13}>
            <cylinderGeometry args={[0.34, 0.6, 26, 8]} />
            <meshStandardMaterial color="#232B35" roughness={0.7} />
          </mesh>
          <mesh position-y={27} rotation-x={0.35}>
            <boxGeometry args={[4.6, 2.6, 0.5]} />
            <meshStandardMaterial
              color="#1A222C"
              emissive={theme.glow}
              emissiveIntensity={night ? 2.4 : 0.15}
              roughness={0.4}
            />
          </mesh>
          {night && (
            <sprite position={[0, 27, 0.8]} scale={[13, 9, 1]}>
              <spriteMaterial map={glowTexture()} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
            </sprite>
          )}
        </group>
      ))}
    </group>
  );
}
