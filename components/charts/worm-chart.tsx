/**
 * Worm chart — cumulative runs by overs, one line per innings (Phase 5).
 * Server-rendered SVG: recessive grid, 2px lines, wicket dots with a surface
 * ring, direct end-labels (identity never rides on color alone — the gold/blue
 * pair is also the strongest CVD pairing in the palette).
 */
import type { WormPoint } from "@/lib/depth/stats";

export interface WormSeriesInput {
  label: string;
  color: string;
  points: WormPoint[];
}

const W = 480;
const H = 250;
const PAD = { top: 14, right: 54, bottom: 26, left: 34 };

export function WormChart({ series, maxOvers }: { series: WormSeriesInput[]; maxOvers: number }) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const maxRuns = Math.max(40, ...series.flatMap((s) => s.points.map((p) => p.runs)));
  const yMax = Math.ceil(maxRuns / 25) * 25;
  const xMax = Math.max(maxOvers, ...series.flatMap((s) => s.points.map((p) => p.overs)), 1);
  const x = (overs: number) => PAD.left + (overs / xMax) * plotW;
  const y = (runs: number) => PAD.top + plotH - (runs / yMax) * plotH;

  const yTicks = [0, yMax / 2, yMax].map((v) => Math.round(v));
  const xStep = xMax > 30 ? 10 : 5;
  const xTicks: number[] = [];
  for (let v = 0; v <= xMax; v += xStep) xTicks.push(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Worm — cumulative runs by over">
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#1F2831" strokeWidth="1" />
          <text x={PAD.left - 6} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#5F6C7A" className="score-figures">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <text key={`x${v}`} x={x(v)} y={H - 8} textAnchor="middle" fontSize="10" fill="#5F6C7A" className="score-figures">
          {v}
        </text>
      ))}
      <text x={W - PAD.right} y={H - 8} textAnchor="start" fontSize="9" fill="#5F6C7A">
        {"  ov"}
      </text>

      {series.map((s) => {
        const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.overs).toFixed(1)} ${y(p.runs).toFixed(1)}`).join(" ");
        const last = s.points.at(-1);
        return (
          <g key={s.label}>
            <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {s.points
              .filter((p) => p.wicket)
              .map((p, i) => (
                <circle key={i} cx={x(p.overs)} cy={y(p.runs)} r="3.4" fill="#E5484D" stroke="#141A21" strokeWidth="2">
                  <title>{`Wicket — ${p.runs} runs, over ${p.overs.toFixed(1)}`}</title>
                </circle>
              ))}
            {last && (
              <text
                x={x(last.overs) + 6}
                y={y(last.runs) + 3.5}
                fontSize="10.5"
                fontWeight="700"
                fill="#93A1B0"
                className="score-figures"
              >
                {s.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
