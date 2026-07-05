/**
 * Bowler pitch map — synthesized line/length scatter on a top-down pitch strip
 * (batter at the bottom, so yorkers land near the popping crease). Boundary
 * balls are larger with a surface ring; wickets red — outcome never rides on
 * hue alone (legend + <title> + size).
 */
import type { PitchDot } from "@/lib/depth/stats";
import type { SynthesizedShot } from "@/lib/providers/types";

const W = 180;
const H = 230;
const PITCH = { x: 42, y: 14, w: 96, h: 190 };

/** Column centers per line (off side on the left for a right-hander). */
const LINE_X: Record<SynthesizedShot["line"], number> = {
  "wide-off": PITCH.x + 12,
  off: PITCH.x + 33,
  middle: PITCH.x + PITCH.w / 2,
  leg: PITCH.x + PITCH.w - 33,
  "wide-leg": PITCH.x + PITCH.w - 12,
};

/** Row centers per length — bouncer shortest (top), yorker at the batter's feet. */
const LENGTH_Y: Record<SynthesizedShot["length"], number> = {
  bouncer: PITCH.y + 30,
  short: PITCH.y + 64,
  good: PITCH.y + 102,
  full: PITCH.y + 140,
  yorker: PITCH.y + 172,
};

export function PitchScatter({ dots }: { dots: PitchDot[] }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Bowler line and length map">
      <rect x={PITCH.x - 20} y={PITCH.y - 8} width={PITCH.w + 40} height={PITCH.h + 26} rx="10" fill="#122417" />
      <rect x={PITCH.x} y={PITCH.y} width={PITCH.w} height={PITCH.h} rx="4" fill="#96773F" opacity="0.55" />
      <rect x={PITCH.x} y={PITCH.y} width={PITCH.w} height={PITCH.h} rx="4" fill="none" stroke="#F5EFE2" strokeOpacity="0.25" strokeWidth="1" />
      {/* Popping crease + stumps at the batter's end */}
      <line x1={PITCH.x - 8} x2={PITCH.x + PITCH.w + 8} y1={PITCH.y + PITCH.h - 12} y2={PITCH.y + PITCH.h - 12} stroke="#F5EFE2" strokeOpacity="0.5" strokeWidth="1.2" />
      {[-4, 0, 4].map((dx) => (
        <line
          key={dx}
          x1={PITCH.x + PITCH.w / 2 + dx}
          x2={PITCH.x + PITCH.w / 2 + dx}
          y1={PITCH.y + PITCH.h - 2}
          y2={PITCH.y + PITCH.h + 8}
          stroke="#E7EDF3"
          strokeOpacity="0.7"
          strokeWidth="1.6"
        />
      ))}
      {/* Length band guides + labels */}
      {(Object.keys(LENGTH_Y) as SynthesizedShot["length"][]).map((len) => (
        <g key={len}>
          <line x1={PITCH.x} x2={PITCH.x + PITCH.w} y1={LENGTH_Y[len] + 17} y2={LENGTH_Y[len] + 17} stroke="#0D1219" strokeOpacity="0.25" strokeWidth="1" />
          <text x={PITCH.x - 24} y={LENGTH_Y[len] + 3} textAnchor="start" fontSize="8.5" fill="#5F6C7A" fontWeight="600">
            {len}
          </text>
        </g>
      ))}
      <text x={PITCH.x + 12} y={H - 4} textAnchor="middle" fontSize="8.5" fill="#5F6C7A" fontWeight="600">
        off
      </text>
      <text x={PITCH.x + PITCH.w - 12} y={H - 4} textAnchor="middle" fontSize="8.5" fill="#5F6C7A" fontWeight="600">
        leg
      </text>

      {dots.map((d, i) => (
        <circle
          key={i}
          cx={LINE_X[d.line] + d.jitter * 6}
          cy={LENGTH_Y[d.length] + d.jitter * 9}
          r={d.wicket ? 4.4 : d.boundary ? 4 : 3}
          fill={d.color}
          fillOpacity={d.wicket || d.boundary ? 0.95 : 0.75}
          stroke={d.wicket || d.boundary ? "#141A21" : "none"}
          strokeWidth={d.wicket || d.boundary ? 1.4 : 0}
        >
          <title>{d.label}</title>
        </circle>
      ))}
    </svg>
  );
}
