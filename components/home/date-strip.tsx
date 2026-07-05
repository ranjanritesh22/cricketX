import Link from "next/link";
import { cn } from "@/lib/cn";
import { addDays, dateKey, dayLabel } from "@/lib/format";

/** FotMob-style horizontal day rail. Today is canonical at "/". */
export function DateStrip({ activeKey, todayKey }: { activeKey: string; todayKey: string }) {
  const today = new Date(`${todayKey}T00:00:00`);
  const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(today, i - 3)));

  return (
    <nav aria-label="Match days" className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 py-2 sm:-mx-4 sm:px-4">
      {days.map((key) => {
        const active = key === activeKey;
        return (
          <Link
            key={key}
            href={key === todayKey ? "/" : `/matches/${key}`}
            aria-current={active ? "date" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
              active
                ? "bg-gold text-night"
                : "border border-edge bg-card text-ink-soft hover:bg-card-raised hover:text-ink",
            )}
          >
            {dayLabel(key, todayKey)}
          </Link>
        );
      })}
    </nav>
  );
}
