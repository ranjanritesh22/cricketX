# PROJECT CONTEXT — "StadiumX" (working name)
### A free, premium, FotMob-grade cricket experience with a synthesized 3D stadium view

> This file is the single source of truth for Claude Code. Read it fully before writing any code.
> When in doubt, optimize for: **speed → clarity → immersion → everything else.**

---

## 1. Product Vision

Build the best free cricket score & match-experience app in the world. Cricbuzz's data depth + FotMob's design language + one killer USP nobody has:

**The Live 3D Stadium View** — every ball of a live match is rendered as a cinematic 3D reconstruction inside a model of the actual venue. The user watching text commentary on Cricbuzz today instead *sees* the ball bowled, the shot played, the ball travel to the boundary or fielder, and the batters run — synthesized in real time from ball-by-ball event data.

### What this is NOT
- NOT a video streaming app (no Hotstar competition on video — we compete on *experience per kilobyte*).
- NOT real ball-tracking (Hawk-Eye data is proprietary). We **synthesize plausible trajectories from event data**. Label it honestly in the UI as "Live Reconstruction" — this builds trust, not weakness.
- NOT auth-gated. Zero login. Zero paywall. Anyone opens the URL and it works.

### Target users
Cricket fans on mobile data in India/South Asia who can't or won't stream video. A full over in our 3D view should cost **< 50 KB of data** after initial load. That's the moat: Hotstar burns ~1 GB/hour; we burn ~1 MB/hour.

---

## 2. Hard Constraints & Honest Realities

1. **No real tracking data exists for us.** APIs give per-ball events: bowler, batter, runs, extras, wicket type, and a free-text description ("flicked off the pads through midwicket"). The 3D view is an *interpretation engine* on top of this. FotMob does exactly this for football with Opta event data.
2. **Data latency** from affordable APIs is 5–60 seconds behind live. Design the UX around this (no "LIVE" red dot pretending to be instant; show "Last ball: 18.4" style anchoring).
3. **Free tier rate limits** are brutal (e.g., 100 req/day on CricketData.org free plan). The server must poll ONCE per match and fan out to all users via SSE/WebSocket. Never let clients hit the provider directly.
4. **Never scrape Cricbuzz/ESPNcricinfo in production.** Prototyping only. Production = licensed API.

---

## 3. Data Layer

### 3.1 Providers (adapter pattern — MANDATORY)

Implement `CricketDataProvider` as an interface. Ship adapters in this order:

```
lib/providers/
  types.ts              // canonical domain types (see 3.3)
  provider.interface.ts // CricketDataProvider interface
  cricsheet.adapter.ts  // historical JSON replays — dev/test/demo mode
  cricketdata.adapter.ts// cricketdata.org — MVP live data
  entitysport.adapter.ts// production candidate (stub initially)
  mock.adapter.ts       // deterministic fixture data for tests/storybook
```

Interface (minimum):

```ts
interface CricketDataProvider {
  getFixtures(date: string): Promise<Fixture[]>;          // home screen
  getSeries(): Promise<Series[]>;
  getMatch(matchId: string): Promise<MatchDetail>;         // header, teams, venue, toss
  getScorecard(matchId: string): Promise<Scorecard>;
  getBallByBall(matchId: string, sinceBall?: BallRef): Promise<BallEvent[]>;
  getSquads(matchId: string): Promise<Squads>;
  getPlayer(playerId: string): Promise<PlayerProfile>;
  getPointsTable(seriesId: string): Promise<PointsTable>;
}
```

**Cricsheet mode is first-class, not a hack.** `?replay=<cricsheet-match-id>&speed=8x` replays any historical match through the entire live pipeline. This is how we develop and demo the 3D engine without burning API quota, and it doubles as a user-facing "Match Replay" feature later.

### 3.2 Sync architecture

```
[Provider API] ←poll every 4–10s per LIVE match, once, server-side
      │
[Next.js Route Handler / small Node worker]
      │  normalize → canonical BallEvent → diff vs last state
      ▼
[Redis (Upstash)]  match:{id}:state  +  pub/sub channel per match
      │
[SSE endpoint /api/live/[matchId]]  ← every connected client subscribes
      ▼
[Client store (Zustand)] → UI + 3D engine consume the same event stream
```

- **SSE over WebSocket** for v1: simpler, works through proxies, auto-reconnect via `EventSource`, and our data flow is one-directional. Revisit WS only if we add chat/reactions.
- Poll frequency adaptive: live match 4s, innings break 60s, pre-match 5min.
- Every SSE message is a **delta** (new balls only), not full state. Full state fetched once on connect from Redis snapshot.
- Vercel functions have execution limits → run the poller as a lightweight always-on worker (Railway/Fly.io, ~$5/mo) OR Vercel Cron + Upstash QStash for MVP. Document the tradeoff in code comments.

### 3.3 Canonical domain types (the contract everything depends on)

```ts
type BallEvent = {
  matchId: string;
  innings: number;
  over: number;            // 18
  ball: number;            // 4  → "18.4"
  bowlerId: string;
  batterId: string;
  nonStrikerId: string;
  runs: { batter: number; extras: number; total: number };
  extraType?: 'wide' | 'noball' | 'bye' | 'legbye' | 'penalty';
  wicket?: { kind: WicketKind; playerOutId: string; fielderIds: string[] };
  commentaryText: string;  // raw provider text — input to the synthesizer
  // ↓ Derived by our Shot Synthesizer (section 4), never from provider:
  synth?: SynthesizedShot;
  timestamp: string;
};

type SynthesizedShot = {
  deliveryType: 'pace' | 'spin';
  length: 'yorker' | 'full' | 'good' | 'short' | 'bouncer';
  line: 'off' | 'middle' | 'leg' | 'wide-off' | 'wide-leg';
  shotType: 'defend' | 'drive' | 'cut' | 'pull' | 'sweep' | 'flick'
          | 'loft' | 'slog' | 'edge' | 'leave' | 'missed' | 'run-out-scramble';
  wagonZone: 1|2|3|4|5|6|7|8;     // standard 8-zone wagon wheel, zone 1 = fine leg (RH batter)
  trajectory: 'ground' | 'flat' | 'lofted' | 'skier';
  landingRadius: number;           // 0..1 fraction of boundary distance
  fielderRole?: FieldingPosition;  // 'sweeper-cover', 'deep-midwicket', etc.
  runsScored: number;
  isBoundary: boolean;
  confidence: number;              // 0..1 — parser certainty; below 0.5 use generic animation
};
```

---

## 4. The Shot Synthesizer (THE core IP — build this with the most care)

Converts `commentaryText` + structured ball data → `SynthesizedShot`. Two stages:

### Stage 1 — Deterministic rules parser (runs everywhere, zero cost)
A pure TypeScript function. Pattern-match the rich vocabulary of cricket commentary:

- **Fielding positions** → wagon zone + radius. Build a complete dictionary: `sweeper cover`, `deep point`, `third man`, `fine leg`, `cow corner`, `long-on`, `mid-off`... (~40 positions, each with polar coordinates on the field, mirrored for left-handers — `BallEvent` batter handedness comes from squad data).
- **Shot verbs** → shotType: `cuts|cut` → cut; `pulls|hooks` → pull; `drives|creams|caresses` → drive; `slogs|heaves|mows` → slog; `edges|nicks|feathers` → edge; `defends|blocks` → defend.
- **Delivery descriptors** → length/line: `yorker`, `full toss`, `short of a length`, `bouncer`, `googly|leg-break|off-break` → spin.
- **Trajectory words**: `along the ground` → ground; `in the air|lofted|goes downtown|deposits` → lofted; `top edge|skies it` → skier.
- **Outcome cross-check**: runs=4 & ground → races to boundary; runs=6 → lofted over the rope at the parsed zone; wicket kind `stumped` → batter down the pitch, misses, keeper animation (see the Cricbuzz screenshot: "Deceives him with a googly... Buttler lightning quick" → spin delivery, batter advance, miss, stumping — the parser must produce exactly this scene).

Real example from the reference screenshot:
> "Adil Rashid to Axar Patel, 1 run, flatter on off stump, Axar goes on the back foot and cuts to the right of sweeper cover"

→ `{ deliveryType:'spin', line:'off', length:'good', shotType:'cut', wagonZone: offside-behind-square-ish (sweeper cover zone), trajectory:'ground', landingRadius:~0.75, fielderRole:'sweeper-cover', runsScored:1, isBoundary:false, confidence: 0.9 }`

Target: **≥80% of balls parsed at confidence ≥0.7** using rules alone. Build a test suite from 500+ real Cricsheet/commentary lines. This parser must be unit-tested to death — it IS the product.

### Stage 2 — LLM fallback (server-side, optional, cached)
For confidence <0.5 balls, one cheap LLM call (Claude Haiku) with a strict JSON schema returning `SynthesizedShot`. Cache by commentary-text hash. Budget: pennies per match. Feature-flagged; app must be fully functional with Stage 1 only.

**Ambiguity policy:** when unsure, animate conservatively (generic drive to the parsed zone). Never invent a spectacular scene for a dot ball. Wrong-but-plausible beats flashy-but-absurd.

---

## 5. The 3D Stadium Engine

### 5.1 Stack
- **react-three-fiber + drei + three.js**, in a lazily-loaded route segment. The 3D bundle must NOT be in the initial JS payload — `next/dynamic` with a beautiful 2D pitch-map fallback (FotMob-style top-down field, also used on low-end devices and as `prefers-reduced-motion` fallback).
- Animation: spring/tween via `@react-spring/three` or manual lerp in `useFrame`. No physics engine — trajectories are scripted bezier arcs (cheaper, deterministic, art-directable).

### 5.2 Scene design (performance-first, "premium low-poly")
- **One parametric stadium model**, not per-venue photorealism. Venue table (name, city, boundary dimensions, stand color theme, day/night lighting preset) skins the same base model: Wankhede = shorter square boundaries + blue-tinted night lighting; MCG = huge oval + grey stands. This is 90% of the "I'm at the stadium" feeling for 1% of the asset cost. Real per-venue GLB models are a later enhancement.
- Stylized players: ~2k-triangle rigged characters, team-colored kits, 6 shared animation clips (bowl-pace, bowl-spin, bat-swing variants, dive, run, celebrate). Instance the 11 fielders.
- Fielder placement: standard field presets (powerplay ring, death-overs spread, spin field) chosen from match phase; the fielder named in commentary snaps to their dictionary position.
- Ball: emissive sphere + fading trail (thin instanced mesh / drei `Trail`). The trail is the signature visual — make it gorgeous.
- Target: **60fps on mid-range Android; total 3D assets < 3 MB gzipped**; DPR clamp at 1.5; `frameloop="demand"` when no animation is playing.

### 5.3 Ball sequence choreography (per BallEvent, ~4–6s)
1. Camera: behind-bowler default (broadcast angle). 2. Bowler run-up + release (clip by pace/spin). 3. Ball travels to parsed line/length. 4. Batter clip by shotType. 5. Ball arcs along bezier to wagonZone × landingRadius (ground = low fast bounce path; lofted = high arc; SIX = crowd-flash + confetti burst at landing stand). 6. Fielder intercept if applicable; batters run `runsScored` times. 7. Wicket = kind-specific mini-scene (bowled: stumps explode; stumped: advance-miss-stump; caught: fielder catch at zone). 8. Score overlay ticks up; camera eases back.
- Events arriving faster than playback → queue; show "2 balls behind ⏩" skip chip.
- Camera presets user-switchable: Broadcast / Batter's eye / Bird's eye / Free orbit.

---

## 6. App Structure & Screens (FotMob-mapped)

Framework: **Next.js 15 App Router, TypeScript strict, Tailwind CSS v4, shadcn/ui, Zustand (live state) + TanStack Query (fetch/cache), Framer Motion (UI micro-motion).** PWA (`next-pwa`): installable, offline shell, score push notifications later.

```
app/
  (home)/page.tsx                  // Match Day home
  matches/[date]/page.tsx
  match/[matchId]/
    layout.tsx                     // sticky score header + tab bar (shared, no refetch on tab switch)
    page.tsx        → redirect to /live or /info by match state
    live/page.tsx                  // ⭐ 3D stadium + commentary feed
    scorecard/page.tsx
    lineups/page.tsx               // FotMob-style visual XI on pitch graphic
    stats/page.tsx                 // worm, manhattan, partnerships, wagon wheels
    h2h/page.tsx                   // rivalry history, recent form
    info/page.tsx                  // venue, toss, officials, weather
  series/[seriesId]/page.tsx       // fixtures, points table, top performers
  player/[playerId]/page.tsx       // profile, career stats, recent form — bottom-sheet on mobile (FotMob pattern)
  api/live/[matchId]/route.ts      // SSE
  api/sync/route.ts                // poller trigger (cron)
```

### Home (clone FotMob's information architecture)
- Horizontal date strip (Yesterday / **Today** / Tomorrow / dates), sticky.
- Matches grouped by tournament in cards: `[Flag] IND  189/7 (20)  vs  ENG  92/3 (11.2) [Flag]` + status chip (LIVE pulsing / FT / time), one-line context ("ENG need 98 off 52"). Required-run-rate context lines are a Cricbuzz weakness — do them beautifully.
- "Live now" filter pill (FotMob's Live toggle). Featured live match → hero card with mini live 3D thumbnail (static render + score, not a running scene).

### Match → Live tab (the USP screen)
- Top 45%: 3D stadium canvas (2D pitch-map fallback). Collapsible like FotMob's pitch widget (chevron in reference screenshot 3).
- Event pill overlay on canvas: "FOUR! Kohli" / "WICKET — st Buttler b Rashid" (mirrors FotMob's "Throw in — A. Masuaku" pill).
- Below: virtualized commentary feed (over headers, W/4/6 badge chips, milestone callouts like Cricbuzz's "100th dismissal" factoids). New balls slide in with Framer Motion.
- Bottom-anchored context bar: CRR, RRR, last 5 overs, current partnership.

### Lineups tab
Playing XI laid out on a field graphic with photos + live match ratings (compute a simple 0–10 rating: runs, SR vs par, wickets, economy — our version of FotMob's ratings, screenshot 5). Tap player → bottom sheet: photo, role, today's stats, wagon wheel of *their* shots this innings (built from our synthesized zones — a feature Cricbuzz doesn't have; screenshot 6's heatmap is the vibe).

### Stats tab
Worm, Manhattan, partnership bars, per-batter wagon wheels, bowler pitch maps (synthesized line/length scatter). Recharts or lightweight visx; theme-consistent.

---

## 7. Design System — "Premium FotMob, cricket-native"

Follow FotMob's dark-first, card-based, breathing-room language but with a cricket-specific identity. Do NOT default to generic dark-slate + single acid-green accent.

- **Palette (dark-first):** background `#0A0E12` (deep night-match navy-black, not pure black); surface cards `#141A21` with 1px `#1F2831` borders and 16px radius; primary accent **floodlight gold** `#F5B82E` (stadium lights — this is our identity color, used sparingly: live pulses, boundary flashes, CTAs); semantic: wicket red `#E5484D`, four `#3B82F6`, six `#8B5CF6`, dot-ball neutral. Light theme derived, dark is default.
- **Type:** display/numeric — a characterful geometric or slab face for scores (scores are the hero; tabular-nums mandatory); body — Inter or General Sans; the big `189/7 (20)` treatment should be instantly recognizable as ours.
- **Signature element:** the golden ball-trail. It appears in the 3D scene, as the live-indicator pulse, in loading states, and subtly in the logo. One motif, everywhere.
- **Motion:** micro (150–250ms ease-out) on cards/sheets; celebratory only for boundaries/wickets. Respect `prefers-reduced-motion` globally.
- **Layout:** mobile-first (390px) → tablet 2-col (matches list + detail) → desktop 3-col (nav rail / content / live sidebar). Bottom tab bar on mobile (Home, Matches, Series, News-later), FotMob-style pill.
- shadcn/ui for primitives (Sheet, Tabs, Skeleton, ScrollArea, Dialog); restyle tokens to this system — it must not look like default shadcn.

---

## 8. Performance Budgets (enforced, not aspirational)

| Metric | Budget |
|---|---|
| Initial JS (home) | < 170 KB gz |
| LCP (home, 4G) | < 1.8s |
| 3D bundle (lazy) | < 400 KB gz JS + < 3 MB assets |
| SSE payload per ball | < 2 KB |
| Data per hour of live viewing | < 1.5 MB |
| Lighthouse (mobile) | ≥ 90 perf, ≥ 95 a11y |

Tactics: RSC for all static match data (SEO — every match/scorecard page must be server-rendered and indexable, this is free growth); client components only for live regions; `next/image` everywhere; skeletons matching final layout; Redis-cached provider responses (fixtures 5min, squads 1h, finished scorecards immutable-forever).

---

## 9. Non-negotiable engineering standards

- TypeScript `strict`; zod-validate every provider response at the boundary (providers WILL send garbage mid-match).
- Every provider adapter gets contract tests against recorded fixtures (record real responses into `__fixtures__/`).
- Shot Synthesizer: table-driven unit tests, 500+ real commentary lines, asserted zone/shot/confidence. CI-gated.
- Graceful degradation ladder: 3D → 2D pitch map → text-only commentary. The app must be excellent with JS-lite.
- Error states designed, not generic: "Scorecard delayed — provider hiccup, retrying" with the venue illustration.
- No auth, but add anonymous rate-limiting on SSE (per-IP) and basic bot protection on API routes.
- Analytics: privacy-friendly (Plausible/PostHog EU), no cookies banner needed.

---

## 10. Build Phases (each phase ships something usable)

**Phase 1 — Foundation + Home (week 1):** repo, design tokens, provider interface, Cricsheet + CricketData adapters, home screen with real fixtures, match header + tabs shell, scorecard tab. *Ship: a fast, beautiful score app.*

**Phase 2 — Live pipeline (week 2):** poller worker, Redis state, SSE endpoint, live commentary feed with delta updates, replay mode (`?replay=`). *Ship: real-time Cricbuzz-parity commentary.*

**Phase 3 — Shot Synthesizer + 2D pitch view (week 3):** rules parser + test suite, 2D top-down animated pitch map (ball travels to zone, wagon wheel accumulates). *Ship: the "FotMob for cricket" moment — already differentiated.*

**Phase 4 — 3D Stadium (weeks 4–6):** r3f scene, parametric stadium, player rigs + clips, choreography queue, camera presets, venue theming. *Ship: the USP.*

**Phase 5 — Depth (ongoing):** lineups with ratings, stats tab, H2H, player profiles, series/points tables, PWA push, LLM fallback parser, per-venue models.

Do phases in order. Do not start Phase 4 before Phase 3's parser passes its test suite — the 3D view is only as good as the synthesizer feeding it.

---

## 11. Environment & config

```
# .env.local
CRICKETDATA_API_KEY=
ENTITYSPORT_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DATA_PROVIDER=cricsheet | cricketdata | entitysport | mock
ANTHROPIC_API_KEY=            # optional, Stage-2 parser only
NEXT_PUBLIC_APP_URL=
```

Provider selection via `DATA_PROVIDER`; app must boot fully in `mock` mode with zero keys (fixtures bundled) so anyone can `pnpm dev` instantly.

---

## 12. Legal & etiquette

- Facts (scores, events) aren't copyrightable, but **provider ToS are contracts** — respect rate limits and attribution requirements of whichever API we license.
- Never ship scraped Cricbuzz/ESPNcricinfo data. Cricsheet is open-licensed (ODC-BY) — attribute it in the footer.
- Player photos: license or use generated stylized avatars/initials until licensed. Do not hotlink images from other sports sites.
- Betting odds: DO NOT include (unlike FotMob's Melbet strip). Keeps us clean for Indian app stores and for kids.

---

*End of context. Build Phase 1. Ask before deviating from the domain types or the provider interface — everything else, use your judgment and this document's spirit: fastest, most beautiful, most immersive free cricket app ever made.*