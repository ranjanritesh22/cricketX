import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/nav/bottom-nav";
import { RegisterSW } from "@/components/pwa/register-sw";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "StadiumX — every ball, reconstructed",
    template: "%s · StadiumX",
  },
  description:
    "Free, fast, beautiful live cricket scores. Every ball of a live match, synthesized into a stadium reconstruction — no login, no paywall, kilobytes not gigabytes.",
  applicationName: "StadiumX",
};

export const viewport: Viewport = {
  themeColor: "#0A0E12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-dvh font-sans">
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-3 pb-24 sm:px-4 sm:pb-12">
          <main className="flex-1">{children}</main>
          <footer className="mt-12 border-t border-edge py-6 text-xs leading-relaxed text-ink-faint">
            <p>
              <span className="font-semibold text-ink-soft">StadiumX</span> — every ball, reconstructed. Free
              forever: no login, no paywall, no betting.
            </p>
            <p className="mt-1">
              Live views are labeled reconstructions synthesized from ball-by-ball data, not real tracking.
              Historical replay data ©{" "}
              <a href="https://cricsheet.org" className="underline decoration-edge underline-offset-2 hover:text-ink-soft">
                Cricsheet
              </a>{" "}
              (ODC-BY).
            </p>
          </footer>
        </div>
        <BottomNav />
        <RegisterSW />
      </body>
    </html>
  );
}
