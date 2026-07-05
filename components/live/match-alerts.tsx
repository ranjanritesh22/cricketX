"use client";

/**
 * Score alerts (Phase 5 PWA) — local notifications for wickets and boundaries,
 * fired straight off the shared live stream store. No push server yet: these
 * work while the app is open (or installed); VAPID web-push is the upgrade
 * path once a backend worker exists.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { BallEvent } from "@/lib/providers/types";
import { useLiveMatch } from "./use-live-match";

const STORAGE_KEY = "stadiumx-alerts";

function alertFor(event: BallEvent): { title: string; body: string } | null {
  const text = event.commentaryText.length > 120 ? `${event.commentaryText.slice(0, 117)}…` : event.commentaryText;
  if (event.wicket) return { title: `WICKET — ${event.wicket.kind}`, body: text };
  if (event.runs.batter === 6) return { title: "SIX!", body: text };
  if (event.runs.batter === 4) return { title: "FOUR!", body: text };
  return null;
}

async function notify(payload: { title: string; body: string }) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(payload.title, { body: payload.body, icon: "/icon.svg", badge: "/icon.svg" });
      return;
    }
  } catch {
    // fall through to the bare Notification API
  }
  new Notification(payload.title, { body: payload.body, icon: "/icon.svg" });
}

export function MatchAlerts({ streamPath }: { streamPath: string }) {
  const { events, version, snapshotVersion, connection } = useLiveMatch(streamPath);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const notifiedVersion = useRef(version);

  useEffect(() => {
    setSupported(typeof Notification !== "undefined");
    setEnabled(typeof Notification !== "undefined" && Notification.permission === "granted" && localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  // Only live-arriving balls alert — never the snapshot backlog on connect.
  useEffect(() => {
    if (!enabled || version <= notifiedVersion.current || version <= snapshotVersion) {
      notifiedVersion.current = Math.max(notifiedVersion.current, version);
      return;
    }
    notifiedVersion.current = version;
    const latest = events.at(-1);
    if (!latest) return;
    const payload = alertFor(latest);
    if (payload) void notify(payload);
  }, [version, snapshotVersion, enabled, events]);

  if (!supported || connection === "ended") return null;

  const toggle = async () => {
    if (enabled) {
      setEnabled(false);
      localStorage.setItem(STORAGE_KEY, "0");
      return;
    }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      setEnabled(true);
      localStorage.setItem(STORAGE_KEY, "1");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? "Turn off wicket and boundary alerts" : "Turn on wicket and boundary alerts"}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-wide transition-colors",
        enabled
          ? "border-gold/50 bg-gold/10 text-gold"
          : "border-edge bg-card text-ink-faint hover:text-ink-soft",
      )}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path
          d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {enabled ? "Alerts on" : "Alerts"}
    </button>
  );
}
