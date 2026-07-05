import { cn } from "@/lib/cn";
import { venueLocalTime } from "@/lib/format";
import type { Fixture } from "@/lib/providers/types";

/** LIVE pulses gold; finished games get a quiet FT; upcoming show venue-local time. */
export function StatusChip({ fixture, className }: { fixture: Fixture; className?: string }) {
  const { status } = fixture;

  if (status === "live" || status === "innings-break") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-bold tracking-wide text-gold",
          className,
        )}
      >
        <span className="size-1.5 animate-live-pulse rounded-full bg-gold" aria-hidden="true" />
        {status === "live" ? "LIVE" : "BREAK"}
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-card-raised px-2 py-0.5 text-[11px] font-bold tracking-wide text-ink-soft",
          className,
        )}
      >
        FT
      </span>
    );
  }

  if (status === "abandoned" || status === "no-result") {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-card-raised px-2 py-0.5 text-[11px] font-bold tracking-wide text-ink-faint",
          className,
        )}
      >
        N/R
      </span>
    );
  }

  return (
    <span className={cn("score-figures text-[11px] font-semibold text-ink-soft", className)}>
      {venueLocalTime(fixture.startTime, fixture.venue.timezone)}
    </span>
  );
}
