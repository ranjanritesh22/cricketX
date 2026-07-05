/**
 * StadiumX service worker — the PWA offline shell (Phase 5).
 *
 * Strategy, tuned for a live-score app where staleness is worse than a miss:
 *  - Navigations: network-first; on failure, the cached copy of that page,
 *    then the designed /offline shell.
 *  - Hashed build assets (/_next/static, fonts, icons): cache-first — they're
 *    immutable by construction.
 *  - /api/* (including the SSE stream): NEVER touched by the worker.
 */
const VERSION = "stadiumx-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data is never served stale

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? caches.match(OFFLINE_URL);
        }),
    );
    return;
  }

  const isImmutable =
    url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname.startsWith("/fonts/");
  if (isImmutable) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
