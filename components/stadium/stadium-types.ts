/**
 * Shared prop types between the main-bundle wrapper (`stadium-view.tsx`) and
 * the lazily-loaded scene (`stadium-scene.tsx`). Types only — no three.js.
 */
import type { MutableRefObject } from "react";
import type { PlayableBall } from "@/components/pitch/pitch-map";
import type { VenueRef } from "@/lib/providers/types";

export type CameraPreset = "broadcast" | "batter" | "bird" | "orbit";

/** The on-field actors the HTML overlay can label. */
export type ActorRole = "bowler" | "striker" | "nonStriker" | "keeper" | "fielder";

/** Screen-space (CSS px, relative to the canvas) projection of one actor's head. */
export interface ProjectedActor {
  role: ActorRole;
  x: number;
  y: number;
  /** In front of the camera and inside the frustum. */
  visible: boolean;
}

export interface StadiumSceneProps {
  /** The ball currently being reconstructed (null = idle tableau). */
  active: PlayableBall | null;
  /** Scoring shots of the innings on screen — rendered as landing markers. */
  wagon: PlayableBall[];
  venue?: VenueRef;
  preset: CameraPreset;
  /** Kit colors. */
  battingColor: string;
  fieldingColor: string;
  oversPerInnings?: number;
  /**
   * The scene writes each labeled actor's screen position here every frame;
   * the panel's HTML overlay reads it to float name + live-stat chips. Kept a
   * ref (not React state) so the 60fps writes never re-render the canvas.
   */
  actorsRef?: MutableRefObject<ProjectedActor[]>;
}
