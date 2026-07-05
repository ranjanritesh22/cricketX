import type { Metadata } from "next";
import { BallTrail } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Offline" };

/** The PWA offline shell — precached by the service worker, designed not generic. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="opacity-80">
        <BallTrail size={48} />
      </div>
      <h1 className="mt-5 font-display text-xl font-bold text-ink">Rain delay — you&apos;re offline</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
        No connection right now. Scores resume the moment you&apos;re back — StadiumX only needs kilobytes.
      </p>
      <a
        href="/"
        className="mt-6 rounded-full bg-gold px-5 py-2 text-sm font-bold text-night transition-opacity hover:opacity-90"
      >
        Try again
      </a>
    </div>
  );
}
