import { cn } from "@/lib/cn";
import type { TeamRef } from "@/lib/providers/types";

/** ISO alpha-2 → emoji flag; zero image bytes on the wire. */
function flagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));
}

/**
 * Country teams get an emoji flag; franchises get a team-colored monogram
 * (player/team art stays unlicensed-clean — CLAUDE.md §12).
 */
export function TeamFlag({ team, className }: { team: TeamRef; className?: string }) {
  if (team.countryCode) {
    return (
      <span className={cn("text-lg leading-none", className)} role="img" aria-label={team.name}>
        {flagEmoji(team.countryCode)}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-5 items-center justify-center rounded-md text-[9px] font-bold text-white",
        className,
      )}
      style={{ backgroundColor: team.primaryColor ?? "#3A4653" }}
    >
      {team.shortName.slice(0, 2)}
    </span>
  );
}
