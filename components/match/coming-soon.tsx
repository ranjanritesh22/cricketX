import { BallTrail } from "@/components/brand/logo";

/** Honest phase-gated placeholder — designed, not generic (CLAUDE.md §9). */
export function ComingSoon({ title, description, phase }: { title: string; description: string; phase: number }) {
  return (
    <div className="animate-fade-up rounded-2xl border border-edge bg-card px-6 py-14 text-center">
      <div className="flex justify-center opacity-80">
        <BallTrail size={44} />
      </div>
      <h2 className="mt-4 font-display text-lg font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">{description}</p>
      <p className="mt-4 inline-block rounded-full border border-edge px-3 py-1 text-[11px] font-bold tracking-wide text-ink-faint uppercase">
        Ships in Phase {phase}
      </p>
    </div>
  );
}
