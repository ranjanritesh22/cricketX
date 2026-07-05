"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { slug: "live", label: "Live" },
  { slug: "scorecard", label: "Scorecard" },
  { slug: "lineups", label: "Lineups" },
  { slug: "stats", label: "Stats" },
  { slug: "h2h", label: "H2H" },
  { slug: "info", label: "Info" },
] as const;

export function MatchTabBar({ matchId, isLive }: { matchId: string; isLive: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Match sections" className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const href = `/match/${matchId}/${tab.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
              active
                ? "border-gold text-ink"
                : "border-transparent text-ink-faint hover:text-ink-soft",
            )}
          >
            {tab.slug === "live" && isLive ? (
              <span className="size-1.5 animate-live-pulse rounded-full bg-gold" aria-hidden="true" />
            ) : null}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
