/**
 * Compact wagon wheel — a batter's scoring shots as trails from the crease,
 * built from Phase-3 synthesized zones (a feature Cricbuzz doesn't have).
 * Colors are the app-wide outcome semantics; sixes additionally get a ringed
 * landing dot so four/six never differ by hue alone.
 */
import type { WagonSegment } from "@/lib/depth/stats";

const SIZE = 200;
const CX = 100;
const CY = 104;
const R = 88;

/** angle 0 = straight down the ground (up on screen), +leg is right for a RH batter. */
function point(angle: number, radius: number): { x: number; y: number } {
  const rad = (angle * Math.PI) / 180;
  return { x: CX - Math.sin(rad) * R * radius, y: CY - Math.cos(rad) * R * radius };
}

export function WagonWheel({ segments, className }: { segments: WagonSegment[]; className?: string }) {
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className ?? "h-auto w-full"} role="img" aria-label="Wagon wheel of scoring shots">
      <circle cx={CX} cy={CY} r={R + 6} fill="#0D1219" stroke="#1F2831" strokeWidth="1.5" />
      <circle cx={CX} cy={CY} r={R} fill="#122417" />
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#E7EDF3" strokeOpacity="0.18" strokeWidth="1.4" />
      <circle cx={CX} cy={CY} r={R * 0.45} fill="none" stroke="#2E4A36" strokeWidth="1" strokeDasharray="3 4" />
      <rect x={CX - 3.5} y={CY - 26} width="7" height="30" rx="1.5" fill="#96773F" opacity="0.85" />
      {segments.map((s, i) => {
        const p = point(s.angle, s.radius);
        return (
          <g key={i}>
            <line
              x1={CX}
              y1={CY}
              x2={p.x}
              y2={p.y}
              stroke={s.color}
              strokeOpacity={s.runs >= 4 ? 0.85 : 0.55}
              strokeWidth={s.runs >= 4 ? 2 : 1.4}
              strokeLinecap="round"
            >
              <title>{s.label}</title>
            </line>
            <circle
              cx={p.x}
              cy={p.y}
              r={s.isSix ? 3.4 : s.runs === 4 ? 2.6 : 1.9}
              fill={s.color}
              stroke={s.isSix ? "#E7EDF3" : "none"}
              strokeWidth={s.isSix ? 1.2 : 0}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Shared outcome legend for wagon wheels and pitch maps. */
export function OutcomeLegend({ withDot = true }: { withDot?: boolean }) {
  const items: [string, string][] = [
    ["#3B82F6", "Four"],
    ["#8B5CF6", "Six"],
    ["#F5B82E", "Runs"],
    ...(withDot ? ([["#93A1B0", "Dot"]] as [string, string][]) : []),
    ["#E5484D", "Wicket"],
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map(([color, label]) => (
        <li key={label} className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-faint">
          <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}
