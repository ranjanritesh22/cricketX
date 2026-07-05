"use client";

import { useEffect } from "react";
import { BallTrail } from "@/components/brand/logo";

/** Designed provider-hiccup state, not a generic crash screen (CLAUDE.md §9). */
export default function MatchError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[match] provider error:", error);
  }, [error]);

  return (
    <div className="animate-fade-up my-6 rounded-2xl border border-edge bg-card px-6 py-14 text-center">
      <div className="flex justify-center opacity-80">
        <BallTrail size={44} />
      </div>
      <h2 className="mt-4 font-display text-lg font-bold text-ink">Scorecard delayed</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
        The data provider hiccuped mid-over. The match hasn&apos;t gone anywhere — retry and we&apos;ll pick it
        straight back up.
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded-full bg-gold px-5 py-2 text-sm font-bold text-night transition-opacity hover:opacity-90"
      >
        Retry
      </button>
    </div>
  );
}
