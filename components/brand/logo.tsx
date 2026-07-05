import Link from "next/link";

/** The golden ball-trail — the signature motif (CLAUDE.md §7). */
export function BallTrail({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sx-trail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#F5B82E" stopOpacity="0" />
          <stop offset="1" stopColor="#F5B82E" />
        </linearGradient>
      </defs>
      <path d="M8 50 C 22 48, 36 40, 46 26" stroke="url(#sx-trail)" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="48" cy="22" r="8" fill="#F5B82E" />
      <path d="M43 18.5 A 8 8 0 0 1 53 25" stroke="#0A0E12" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="StadiumX home">
      <BallTrail />
      <span className="font-display text-xl font-bold tracking-tight">
        Stadium<span className="text-gold">X</span>
      </span>
    </Link>
  );
}
