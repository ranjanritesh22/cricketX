/** Ball → badge chip mapping, shared by the server feed and the live client feed. */
import type { BallEvent } from "@/lib/providers/types";

export function ballOutcome(e: BallEvent): { label: string; className: string } {
  if (e.wicket) return { label: "W", className: "bg-wicket text-white" };
  if (e.extraType === "wide") return { label: "wd", className: "border border-edge text-ink-soft" };
  if (e.extraType === "noball") return { label: "nb", className: "border border-edge text-ink-soft" };
  if (e.runs.batter === 4) return { label: "4", className: "bg-four text-white" };
  if (e.runs.batter === 6) return { label: "6", className: "bg-six text-white" };
  if (e.runs.total === 0) return { label: "•", className: "bg-card-raised text-ink-faint" };
  return { label: `${e.runs.total}`, className: "bg-card-raised text-ink" };
}
