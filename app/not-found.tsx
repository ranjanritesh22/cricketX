import Link from "next/link";
import { BallTrail } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 py-16 text-center">
      <BallTrail size={56} />
      <h1 className="mt-5 font-display text-2xl font-bold text-ink">Gone — over the ropes</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
        That page sailed clean out of the stadium. Whatever you were looking for isn&apos;t here.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-gold px-5 py-2 text-sm font-bold text-night transition-opacity hover:opacity-90"
      >
        Back to today&apos;s matches
      </Link>
    </div>
  );
}
