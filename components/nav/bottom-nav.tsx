"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  {
    href: "/",
    label: "Home",
    match: (path: string) => path === "/",
    icon: (
      <path d="M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    href: "/matches",
    label: "Matches",
    match: (path: string) => path.startsWith("/matches") || path.startsWith("/match/"),
    icon: (
      <>
        <rect x="3.5" y="5" width="17" height="16" rx="2.5" strokeWidth="1.8" />
        <path d="M3.5 10h17M8 3v4M16 3v4" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/series",
    label: "Series",
    match: (path: string) => path.startsWith("/series"),
    icon: (
      <path
        d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4Zm10 1h3a3.5 3.5 0 0 1-3.5 4.4M7 5H4a3.5 3.5 0 0 0 3.5 4.4"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-edge bg-night/90 backdrop-blur sm:hidden"
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                active ? "text-gold" : "text-ink-faint hover:text-ink-soft",
              )}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
