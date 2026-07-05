/**
 * Anonymous per-IP limiter for the SSE endpoint (CLAUDE.md §9 — no auth, but
 * no free-for-all either). In-memory: correct for a single Node instance,
 * which is the deployment story for the memory store anyway. A multi-instance
 * deployment should swap this for a Redis-based limiter alongside the
 * Upstash store.
 */

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 30;
const MAX_CONCURRENT_STREAMS = 6;

interface IpRecord {
  windowStart: number;
  attempts: number;
  concurrent: number;
}

const globalStore = globalThis as unknown as { __stadiumxRateLimiter?: Map<string, IpRecord> };
const records = (globalStore.__stadiumxRateLimiter ??= new Map<string, IpRecord>());

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local";
  return headers.get("x-real-ip") ?? "local";
}

export interface Permit {
  ok: boolean;
  release: () => void;
}

export function acquireStream(ip: string, now = Date.now()): Permit {
  let rec = records.get(ip);
  if (!rec || now - rec.windowStart >= WINDOW_MS) {
    rec = { windowStart: now, attempts: 0, concurrent: rec?.concurrent ?? 0 };
    records.set(ip, rec);
  }
  rec.attempts += 1;
  if (rec.attempts > MAX_ATTEMPTS_PER_WINDOW || rec.concurrent >= MAX_CONCURRENT_STREAMS) {
    return { ok: false, release: () => {} };
  }
  rec.concurrent += 1;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      const current = records.get(ip);
      if (current) current.concurrent = Math.max(0, current.concurrent - 1);
    },
  };
}

/** Test hook. */
export function resetRateLimiter() {
  records.clear();
}
