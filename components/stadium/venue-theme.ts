/**
 * Parametric venue theming (Phase 4, CLAUDE.md §5.2) — one stadium model,
 * skinned per venue. A small table covers marquee grounds (boundary size,
 * stand colors, day/night lighting); everything else gets a deterministic
 * hash-derived skin so two unknown venues still look like two different
 * places. Pure data — no three.js imports, safe in the main bundle.
 */
import type { VenueRef } from "@/lib/providers/types";

export interface VenueTheme {
  /** Boundary semi-axes in meters: `rx` square of the wicket, `rz` straight. */
  rx: number;
  rz: number;
  lighting: "night" | "day";
  /** Sky / fog clear color. */
  sky: string;
  /** Seating bowl tiers + roof band. */
  standLower: string;
  standUpper: string;
  roof: string;
  /** Crowd speckle palette painted into the runtime canvas texture. */
  crowd: string[];
  /** Floodlight tint (night) / sun tint (day). */
  glow: string;
  /**
   * Signature architecture (CLAUDE.md §5.2 "90% of the I'm-at-the-stadium
   * feeling") — the same base bowl gets iconic per-venue structures behind the
   * boundary so Lord's reads as Lord's, not a generic ring.
   */
  landmarks?: {
    /** Victorian pavilion (brick color) behind one end — Lord's, the Oval. */
    pavilion?: string;
    /** The white cantilevered media centre pod opposite it — Lord's. */
    mediaPod?: boolean;
    /** Roofed grandstand accent color, if the venue has a marquee stand. */
    grandstand?: string;
  };
}

const NIGHT_SKY = "#070B12";
const DAY_SKY = "#8FB6D9";

/** Keys are matched as lowercase substrings of "name city". */
const KNOWN: ReadonlyArray<[string, VenueTheme]> = [
  [
    "wankhede",
    {
      rx: 59, rz: 64, lighting: "night", sky: NIGHT_SKY,
      standLower: "#12325E", standUpper: "#0C2444", roof: "#E8EDF4",
      crowd: ["#2E5AA8", "#D8DEE8", "#F5B82E", "#7FA0D0"], glow: "#BFD4F5",
    },
  ],
  [
    "narendra modi",
    {
      rx: 69, rz: 72, lighting: "night", sky: NIGHT_SKY,
      standLower: "#7A3D14", standUpper: "#5A2C0E", roof: "#D9D2C5",
      crowd: ["#E07B39", "#F0E6D6", "#3D6FB8", "#C2571F"], glow: "#F5D9A8",
    },
  ],
  [
    "eden gardens",
    {
      rx: 64, rz: 68, lighting: "night", sky: NIGHT_SKY,
      standLower: "#5E1E4A", standUpper: "#411334", roof: "#CBBFD4",
      crowd: ["#9C4F86", "#E3D7E8", "#F5B82E", "#6E2E5C"], glow: "#E8CDF0",
    },
  ],
  [
    "chinnaswamy",
    {
      rx: 56, rz: 60, lighting: "night", sky: NIGHT_SKY,
      standLower: "#7B1E28", standUpper: "#57141C", roof: "#D8CFC2",
      crowd: ["#C24450", "#EADDD0", "#F5B82E", "#8F2A35"], glow: "#F5C9A8",
    },
  ],
  [
    "melbourne",
    {
      rx: 75, rz: 78, lighting: "day", sky: DAY_SKY,
      standLower: "#6E7681", standUpper: "#525962", roof: "#E4E8EC",
      crowd: ["#8A939E", "#D7DCE2", "#3D6FB8", "#5E6871"], glow: "#FFF3D6",
    },
  ],
  [
    "lord's",
    {
      rx: 62, rz: 66, lighting: "day", sky: DAY_SKY,
      standLower: "#7A8A6E", standUpper: "#5C6B52", roof: "#F0E9D8",
      crowd: ["#94A388", "#EDE6D4", "#B8443E", "#71806A"], glow: "#FFF7E0",
      landmarks: { pavilion: "#8A4B3A", mediaPod: true, grandstand: "#F0E9D8" },
    },
  ],
  [
    "oval",
    {
      rx: 64, rz: 62, lighting: "day", sky: DAY_SKY,
      standLower: "#3B5A46", standUpper: "#2A4234", roof: "#E6EAE2",
      crowd: ["#4F8060", "#E3E8DE", "#D89A3E", "#3A5E48"], glow: "#FFF7E0",
      landmarks: { pavilion: "#9A5A44", grandstand: "#E6EAE2" },
    },
  ],
  [
    "grand prairie",
    {
      rx: 61, rz: 65, lighting: "night", sky: NIGHT_SKY,
      standLower: "#134A54", standUpper: "#0D343C", roof: "#DCE6E4",
      crowd: ["#2E7D8C", "#DAE6E4", "#F5B82E", "#1E5661"], glow: "#C8ECF0",
    },
  ],
];

/** Hash-derived fallback palettes for venues outside the table. */
const FALLBACK_STANDS: ReadonlyArray<Pick<VenueTheme, "standLower" | "standUpper" | "roof" | "crowd" | "glow">> = [
  { standLower: "#1C3B5E", standUpper: "#132A44", roof: "#E4EAF0", crowd: ["#3D6FA8", "#D8DEE8", "#F5B82E"], glow: "#CFE0F5" },
  { standLower: "#4A2B14", standUpper: "#33200E", roof: "#DED4C2", crowd: ["#B0722E", "#EDE2D0", "#3D6FB8"], glow: "#F5DFB8" },
  { standLower: "#23423A", standUpper: "#182E28", roof: "#DCE6E0", crowd: ["#3E8A70", "#D8E6DE", "#F5B82E"], glow: "#D0F0E0" },
  { standLower: "#43265A", standUpper: "#2E1A3F", roof: "#E0D8E8", crowd: ["#7E52A8", "#DED4E8", "#F5B82E"], glow: "#E4D2F5" },
  { standLower: "#5A2430", standUpper: "#401820", roof: "#E6D8D4", crowd: ["#A84E5E", "#E8D8D4", "#F5B82E"], glow: "#F5D0C8" },
];

function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function venueTheme(venue: VenueRef | undefined | null): VenueTheme {
  const key = `${venue?.name ?? ""} ${venue?.city ?? ""}`.toLowerCase();
  for (const [needle, theme] of KNOWN) {
    if (key.includes(needle)) return theme;
  }
  const h = hashOf(key || "unknown venue");
  const skin = FALLBACK_STANDS[h % FALLBACK_STANDS.length]!;
  return {
    rx: 57 + (h % 14), // 57–70 m square boundaries
    rz: 61 + ((h >> 4) % 14),
    lighting: "night", // floodlight gold is the brand — night is the default vibe
    sky: NIGHT_SKY,
    ...skin,
  };
}
