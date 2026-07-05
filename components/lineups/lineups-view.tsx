"use client";

/**
 * Visual XI on a field graphic with live 0–10 ratings (Phase 5, CLAUDE.md §6).
 * Tap a player → bottom sheet with today's numbers and THEIR wagon wheel,
 * built from Phase-3 synthesized zones. All data arrives precomputed and
 * serializable from the server page — this component only lays it out.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import type { WagonSegment } from "@/lib/depth/stats";
import type { TeamRef } from "@/lib/providers/types";
import { WagonWheel, OutcomeLegend } from "@/components/charts/wagon-wheel";
import { TeamFlag } from "@/components/ui/team-flag";

export interface LineupPlayer {
  id: string;
  name: string;
  role?: string;
  isCaptain?: boolean;
  isKeeper?: boolean;
  battingHand?: string;
  bowlingStyle?: string;
  rating?: number;
  battingLine?: string;
  dismissal?: string;
  bowlingLine?: string;
  wagon: WagonSegment[];
}

export interface LineupTeam {
  team: TeamRef;
  players: LineupPlayer[];
}

/** 11 players → field rows, batting order top to bottom. */
const ROWS = [2, 3, 3, 3];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

function ratingClasses(rating: number): string {
  if (rating >= 8) return "bg-gold text-night";
  if (rating >= 7) return "bg-four text-white";
  if (rating >= 5) return "bg-card-raised text-ink";
  return "bg-wicket text-white";
}

function RatingBadge({ rating, className }: { rating?: number; className?: string }) {
  if (rating === undefined) return null;
  return (
    <span
      className={cn(
        "score-figures inline-flex min-w-7 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold",
        ratingClasses(rating),
        className,
      )}
    >
      {rating.toFixed(1)}
    </span>
  );
}

function PlayerSpot({ player, color, onOpen }: { player: LineupPlayer; color: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-16 flex-col items-center gap-1 text-center"
      aria-label={`${player.name}${player.rating !== undefined ? `, rating ${player.rating.toFixed(1)}` : ""}`}
    >
      <span className="relative">
        <span
          className="flex size-10 items-center justify-center rounded-full border-2 bg-night/70 font-display text-xs font-bold text-ink backdrop-blur transition-transform group-hover:scale-110 group-active:scale-95"
          style={{ borderColor: color }}
        >
          {initials(player.name)}
        </span>
        <RatingBadge rating={player.rating} className="absolute -top-1.5 -right-3 shadow" />
      </span>
      <span className="w-20 truncate text-[10px] leading-tight font-semibold text-ink">
        {player.name.split(" ").at(-1)}
        {player.isCaptain ? " (c)" : player.isKeeper ? " †" : ""}
      </span>
    </button>
  );
}

function FieldGraphic({ team, onOpen }: { team: LineupTeam; onOpen: (p: LineupPlayer) => void }) {
  const color = team.team.primaryColor ?? "#F5B82E";
  const rows: LineupPlayer[][] = [];
  let cursor = 0;
  for (const size of ROWS) {
    rows.push(team.players.slice(cursor, cursor + size));
    cursor += size;
  }
  if (cursor < team.players.length) rows.push(team.players.slice(cursor));

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-edge px-2 py-4"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 0%, rgba(245,184,46,0.05), transparent 55%), radial-gradient(85% 75% at 50% 50%, #17351F 0%, #0E2013 78%, #0B1810 100%)",
      }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-[50%] border border-white/5" />
      <div className="relative flex flex-col gap-4">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start justify-evenly">
            {row.map((p) => (
              <PlayerSpot key={p.id} player={p} color={color} onOpen={() => onOpen(p)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerSheet({ player, team, onClose }: { player: LineupPlayer; team: TeamRef; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal to <body>: the page wrapper keeps a transform from its entrance
  // animation, which would otherwise trap position:fixed inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={player.name}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-night/70 backdrop-blur-sm" />
      <div className="animate-fade-up relative w-full max-w-md rounded-t-2xl border border-edge bg-card p-5 sm:rounded-2xl">
        <div className="flex items-start gap-3">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-full border-2 bg-night/70 font-display text-sm font-bold text-ink"
            style={{ borderColor: team.primaryColor ?? "#F5B82E" }}
          >
            {initials(player.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-display text-base font-bold text-ink">
              <span className="truncate">{player.name}</span>
              <RatingBadge rating={player.rating} />
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {[player.role, player.battingHand ? `${player.battingHand}-hand bat` : null, player.bowlingStyle]
                .filter(Boolean)
                .join(" · ") || team.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player details"
            className="rounded-lg p-1 text-ink-faint transition-colors hover:bg-card-raised hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {(player.battingLine || player.bowlingLine) && (
          <dl className="mt-4 space-y-2 rounded-xl border border-edge bg-night/40 px-3.5 py-3">
            {player.battingLine && (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-xs font-semibold text-ink-faint">Batting</dt>
                <dd className="score-figures text-right font-bold text-ink">
                  {player.battingLine}
                  {player.dismissal && <span className="ml-2 text-xs font-medium text-ink-faint">{player.dismissal}</span>}
                </dd>
              </div>
            )}
            {player.bowlingLine && (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="text-xs font-semibold text-ink-faint">Bowling</dt>
                <dd className="score-figures font-bold text-ink">{player.bowlingLine}</dd>
              </div>
            )}
          </dl>
        )}

        {player.wagon.length > 0 ? (
          <div className="mt-4">
            <p className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">
              Shots this innings · synthesized
            </p>
            <div className="mx-auto mt-2 max-w-55">
              <WagonWheel segments={player.wagon} />
            </div>
            <div className="mt-2 flex justify-center">
              <OutcomeLegend withDot={false} />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-ink-faint">
            No scoring shots to chart yet{player.battingLine ? "" : " — hasn't batted"}.
          </p>
        )}

        <Link
          href={`/player/${encodeURIComponent(player.id)}`}
          className="mt-4 block rounded-xl border border-edge bg-card-raised px-4 py-2.5 text-center text-sm font-bold text-ink transition-colors hover:border-gold/40"
        >
          Full profile →
        </Link>
      </div>
    </div>,
    document.body,
  );
}

export function LineupsView({ teams }: { teams: LineupTeam[] }) {
  const [teamIdx, setTeamIdx] = useState(0);
  const [open, setOpen] = useState<LineupPlayer | null>(null);
  const active = teams[Math.min(teamIdx, teams.length - 1)];
  if (!active) return null;

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Team" className="flex gap-1.5 rounded-xl border border-edge bg-card p-1">
        {teams.map((t, i) => (
          <button
            key={t.team.id}
            role="tab"
            aria-selected={i === teamIdx}
            onClick={() => setTeamIdx(i)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors",
              i === teamIdx ? "bg-card-raised text-ink" : "text-ink-faint hover:text-ink-soft",
            )}
          >
            <TeamFlag team={t.team} />
            {t.team.shortName}
          </button>
        ))}
      </div>

      <FieldGraphic team={active} onOpen={setOpen} />

      <p className="px-1 text-[10px] leading-relaxed text-ink-faint">
        Ratings are StadiumX match ratings (0–10) from runs, strike rate, wickets, economy and fielding — they update
        live. Tap a player for their synthesized wagon wheel.
      </p>

      {open && <PlayerSheet player={open} team={active.team} onClose={() => setOpen(null)} />}
    </div>
  );
}
