"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (production only — a dev-mode worker caches
 * stale HMR assets and turns debugging into archaeology).
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[pwa] service worker registration failed:", err);
    });
  }, []);
  return null;
}
