/**
 * Manhattan — runs per over as bars, wickets as ringed dots above the bar.
 * Single-series magnitude → one hue (floodlight gold), 2px gaps between bars,
 * native <title> tooltips per over.
 */
import type { OverBar } from "@/lib/depth/stats";

const W = 480;
const H = 190;
const PAD = { top: 16, right: 10, bottom: 24, left: 30 };

export function ManhattanChart({ bars, totalOvers }: { bars: OverBar[]; totalOvers: number }) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slots = Math.max(totalOvers, bars.length, 1);
  const maxRuns = Math.max(12, ...bars.map((b) => b.runs));
  const yMax = Math.ceil(maxRuns / 6) * 6;
  const slotW = plotW / slots;
  const barW = Math.max(slotW - 2, 3); // 2px surface gap between bars
  const y = (runs: number) => PAD.top + plotH - (runs / yMax) * plotH;

  const byOver = new Map(bars.map((b) => [b.over, b]));
  const labelStep = slots > 25 ? 10 : 5;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Manhattan — runs per over">
      {[yMax / 2, yMax].map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#1F2831" strokeWidth="1" />
          <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#5F6C7A" className="score-figures">
            {v}
          </text>
        </g>
      ))}
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#2A3542" strokeWidth="1" />

      {Array.from({ length: slots }, (_, i) => {
        const over = i + 1;
        const bar = byOver.get(over);
        const cx = PAD.left + i * slotW + slotW / 2;
        return (
          <g key={over}>
            {bar && bar.runs > 0 && (
              <rect
                x={cx - barW / 2}
                y={y(bar.runs)}
                width={barW}
                height={y(0) - y(bar.runs)}
                rx={Math.min(2, barW / 2)}
                fill="#F5B82E"
                fillOpacity={0.82}
              >
                <title>{`Over ${over} — ${bar.runs} run${bar.runs === 1 ? "" : "s"}${bar.wickets ? `, ${bar.wickets} wicket${bar.wickets === 1 ? "" : "s"}` : ""}`}</title>
              </rect>
            )}
            {bar &&
              Array.from({ length: bar.wickets }, (_, w) => (
                <circle
                  key={w}
                  cx={cx}
                  cy={y(bar.runs) - 6 - w * 8}
                  r="3"
                  fill="#E5484D"
                  stroke="#141A21"
                  strokeWidth="1.6"
                />
              ))}
            {over % labelStep === 0 && (
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="10" fill="#5F6C7A" className="score-figures">
                {over}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
