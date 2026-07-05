import Link from "next/link";
import { cn } from "@/lib/cn";
import { FORMAT_LABEL } from "@/lib/format";
import type { Fixture } from "@/lib/providers/types";
import { MatchRow } from "./match-row";

function groupBySeries(fixtures: Fixture[]): { seriesId: string; seriesName: string; fixtures: Fixture[] }[] {
  const groups = new Map<string, { seriesId: string; seriesName: string; fixtures: Fixture[] }>();
  for (const f of fixtures) {
    const group = groups.get(f.seriesId) ?? { seriesId: f.seriesId, seriesName: f.seriesName, fixtures: [] };
    group.fixtures.push(f);
    groups.set(f.seriesId, group);
  }
  return [...groups.values()];
}

export function LiveFilterPill({
  basePath,
  liveActive,
  liveCount,
}: {
  basePath: string;
  liveActive: boolean;
  liveCount: number;
}) {
  if (liveCount === 0 && !liveActive) return null;
  return (
    <Link
      href={liveActive ? basePath : `${basePath}?live=1`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        liveActive ? "bg-gold text-night" : "border border-edge bg-card text-ink-soft hover:text-ink",
      )}
    >
      <span className={cn("size-1.5 rounded-full", liveActive ? "bg-night" : "animate-live-pulse bg-gold")} />
      Live{liveCount > 0 ? ` (${liveCount})` : ""}
    </Link>
  );
}

export function MatchDayList({ fixtures, emptyLabel }: { fixtures: Fixture[]; emptyLabel: string }) {
  if (fixtures.length === 0) {
    return (
      <div className="rounded-2xl border border-edge bg-card px-6 py-14 text-center">
        <p className="text-3xl" aria-hidden="true">
          🦗
        </p>
        <p className="mt-3 text-sm font-medium text-ink-soft">{emptyLabel}</p>
        <p className="mt-1 text-xs text-ink-faint">No cricket today — a rare and terrible thing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupBySeries(fixtures).map((group) => (
        <section key={group.seriesId} className="animate-fade-up overflow-hidden rounded-2xl border border-edge bg-card">
          <header className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <h2 className="truncate text-xs font-bold tracking-wide text-ink-soft uppercase">{group.seriesName}</h2>
            <span className="ml-3 shrink-0 rounded-md bg-card-raised px-1.5 py-0.5 text-[10px] font-bold text-ink-faint">
              {FORMAT_LABEL[group.fixtures[0]?.format ?? "T20"]}
            </span>
          </header>
          <div className="divide-y divide-edge">
            {group.fixtures.map((fixture) => (
              <MatchRow key={fixture.id} fixture={fixture} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
