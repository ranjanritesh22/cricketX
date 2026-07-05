import type { Metadata } from "next";
import { getPointsTable, getSeries } from "@/lib/data";
import { FORMAT_LABEL } from "@/lib/format";
import { Logo } from "@/components/brand/logo";
import type { PointsTable } from "@/lib/providers/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Series" };

function PointsTableView({ table }: { table: PointsTable }) {
  return (
    <div className="border-t border-edge">
      {table.groups.map((group, gi) => (
        <table key={group.name ?? gi} className="w-full">
          <thead>
            <tr className="border-b border-edge/60">
              <th className="w-full py-1.5 pl-4 text-left text-[10px] font-bold tracking-wider text-ink-faint uppercase">
                {group.name ?? "Team"}
              </th>
              {["P", "W", "L", "NR", "Pts", "NRR"].map((h) => (
                <th key={h} className="px-2 py-1.5 text-right text-[10px] font-bold tracking-wider text-ink-faint uppercase last:pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-edge/60">
            {group.rows.map((row, idx) => (
              <tr key={row.teamId}>
                <td className="py-2 pl-4 text-sm font-semibold text-ink">
                  <span className="score-figures mr-2 inline-block w-4 text-xs text-ink-faint">{idx + 1}</span>
                  <span className="min-[420px]:hidden">{row.teamShortName}</span>
                  <span className="hidden min-[420px]:inline">{row.teamName}</span>
                </td>
                <td className="score-figures px-2 py-2 text-right text-sm text-ink-soft">{row.played}</td>
                <td className="score-figures px-2 py-2 text-right text-sm text-ink-soft">{row.won}</td>
                <td className="score-figures px-2 py-2 text-right text-sm text-ink-soft">{row.lost}</td>
                <td className="score-figures px-2 py-2 text-right text-sm text-ink-soft">{row.noResult + row.tied}</td>
                <td className="score-figures px-2 py-2 text-right text-sm font-bold text-ink">{row.points}</td>
                <td className="score-figures px-2 py-2 pr-4 text-right text-sm text-ink-soft">
                  {row.netRunRate === null ? "–" : row.netRunRate > 0 ? `+${row.netRunRate.toFixed(2)}` : row.netRunRate.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

export default async function SeriesPage() {
  const series = await getSeries();
  const tables = await Promise.all(series.map((s) => getPointsTable(s.id).catch(() => null)));

  return (
    <>
      <div className="flex items-center justify-between pt-4 pb-3">
        <Logo />
      </div>
      <h1 className="pb-3 font-display text-lg font-bold">Series</h1>
      <div className="space-y-4">
        {series.map((s, idx) => {
          const table = tables[idx];
          return (
            <section key={s.id} className="animate-fade-up overflow-hidden rounded-2xl border border-edge bg-card">
              <header className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-ink">{s.name}</h2>
                  {(s.startDate || s.endDate) && (
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {[s.startDate, s.endDate].filter(Boolean).join(" → ")}
                    </p>
                  )}
                </div>
                <span className="ml-3 shrink-0 rounded-md bg-card-raised px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">
                  {s.formats.map((f) => FORMAT_LABEL[f]).join(" · ")}
                </span>
              </header>
              {table && table.groups.length > 0 ? <PointsTableView table={table} /> : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
