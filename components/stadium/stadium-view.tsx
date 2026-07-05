"use client";

/**
 * Main-bundle gateway to the 3D stadium (Phase 4, CLAUDE.md §5.1). The whole
 * three.js scene loads through `next/dynamic` — none of it lands in the
 * initial JS payload. While the chunk streams in, a floodlit skeleton keeps
 * the panel's shape. `supportsWebGL()` lets the panel fall back to the 2D
 * pitch map on devices with no GL context (the graceful-degradation ladder:
 * 3D → 2D → text).
 */
import dynamic from "next/dynamic";
import type { StadiumSceneProps } from "./stadium-types";

export type { CameraPreset, StadiumSceneProps } from "./stadium-types";

let webglSupport: boolean | null = null;

export function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function StadiumLoading() {
  return (
    <div className="flex aspect-[3/2] w-full items-center justify-center bg-night/60">
      <div className="flex flex-col items-center gap-2.5">
        <span className="size-2.5 animate-live-pulse rounded-full bg-gold" aria-hidden="true" />
        <p className="text-xs text-ink-soft">Building the stadium…</p>
      </div>
    </div>
  );
}

const StadiumScene = dynamic(() => import("./stadium-scene"), {
  ssr: false,
  loading: () => <StadiumLoading />,
});

export function StadiumView(props: StadiumSceneProps) {
  return (
    <div className="aspect-[3/2] w-full" data-testid="stadium-3d">
      <StadiumScene {...props} />
    </div>
  );
}
