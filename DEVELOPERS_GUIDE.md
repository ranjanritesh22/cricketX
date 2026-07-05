# StadiumX — The Developer's Guide

> **Who this is for:** any developer joining this project — including someone fresh out of college who has never seen this codebase, never used Next.js server components, and never worked with live sports data. Read this top to bottom once and you will understand what the app is, how data flows through it, what every file does, how to run and test everything on your laptop, and how to take it to production with real live cricket data.
>
> The **product spec** (vision, constraints, budgets, design system) lives in [CLAUDE.md](./CLAUDE.md). That file says *what to build and why*. This file says *what was built, how it works, and how to work on it*.

---

## Table of contents

1. [What is this app?](#1-what-is-this-app)
2. [The tech stack (and why each piece)](#2-the-tech-stack-and-why-each-piece)
3. [The architecture in one picture](#3-the-architecture-in-one-picture)
4. [Where the data comes from — the backend explained](#4-where-the-data-comes-from--the-backend-explained)
5. [The complete file-by-file walkthrough](#5-the-complete-file-by-file-walkthrough)
   - [5.1 `lib/providers/` — the data layer](#51-libproviders--the-data-layer)
   - [5.2 `lib/live/` — the real-time pipeline](#52-liblive--the-real-time-pipeline)
   - [5.3 `lib/synth/` — the Shot Synthesizer (the core IP)](#53-libsynth--the-shot-synthesizer-the-core-ip)
   - [5.4 `lib/depth/` — ratings, stats, head-to-head](#54-libdepth--ratings-stats-head-to-head)
   - [5.5 `lib/` root helpers](#55-lib-root-helpers)
   - [5.6 `app/` — every route explained](#56-app--every-route-explained)
   - [5.7 `components/` — every component explained](#57-components--every-component-explained)
   - [5.8 Config files, tests, and everything else](#58-config-files-tests-and-everything-else)
6. [How the code flows — five end-to-end walkthroughs](#6-how-the-code-flows--five-end-to-end-walkthroughs)
7. [Running the app locally](#7-running-the-app-locally)
8. [Testing every feature locally](#8-testing-every-feature-locally)
9. [The features, explained as a product](#9-the-features-explained-as-a-product)
10. [How to add a new feature — recipes](#10-how-to-add-a-new-feature--recipes)
11. [Going to production — the complete playbook](#11-going-to-production--the-complete-playbook)
12. [Glossary for newcomers](#12-glossary-for-newcomers)

---

## 1. What is this app?

**StadiumX** is a free cricket live-score web app — think Cricbuzz's data depth with FotMob's polish — with one feature nobody else has: a **Live 3D Stadium View**. Every ball of a live match is rendered as a small cinematic 3D scene (bowler runs in, batter plays the shot, ball flies to the boundary or a fielder) *synthesized from text commentary and ball-by-ball event data*. No video. No real ball-tracking. The whole experience costs about **1 MB of data per hour** instead of the ~1 GB/hour video streaming costs — that's the moat for fans on mobile data.

Three honest constraints shape everything in this codebase:

1. **We never get tracking data.** Cricket APIs give us per-ball *events*: who bowled, who batted, how many runs, the wicket type, and a free-text description like *"flicked off the pads through midwicket"*. Everything visual is an **interpretation** of that text — and the UI honestly labels it "Live Reconstruction", never pretending to be real tracking.
2. **API data is 5–60 seconds behind live and rate limits are brutal** (100 requests/day on the free tier). So the server polls the provider **once per match** and fans the result out to every viewer. Clients never talk to a provider.
3. **No login, no paywall, no betting.** Anyone opens the URL and it works.

The app is fully built across the 5 planned phases: score app → live pipeline → shot synthesizer + 2D pitch view → 3D stadium → depth features (ratings, stats, H2H, player pages, PWA, LLM fallback parser).

---

## 2. The tech stack (and why each piece)

| Technology | Where | Why it was chosen |
|---|---|---|
| **Next.js 15 (App Router)** | `app/` | Server-rendering all match data makes pages fast and SEO-indexable (free growth). Route handlers give us API endpoints in the same repo. |
| **TypeScript (strict + `noUncheckedIndexedAccess`)** | everywhere | The domain (innings, overs, extras, wickets) is full of edge cases; the compiler catches half of them for free. |
| **Tailwind CSS v4** | `app/globals.css` + components | Design tokens (night-navy palette, floodlight-gold accent) are defined once and used as utility classes. |
| **zod v4** | `lib/providers/*.schema.ts`, `lib/synth/stage2.ts` | Every byte from an external API (and from the LLM) is validated at the boundary. Providers *will* send garbage mid-match. |
| **zustand v5** | `components/live/use-live-match.ts`, `use-playhead.ts` | Tiny client state store. One store per live stream, shared by the feed, the 2D map, and the 3D engine. |
| **Server-Sent Events (SSE)** | `app/api/live/[matchId]/route.ts` | One-directional live updates. Simpler than WebSockets, survives proxies, and the browser's `EventSource` reconnects automatically. |
| **react-three-fiber + three.js** | `components/stadium/` | The 3D stadium. Loaded lazily via `next/dynamic` so three.js never touches the initial page load. |
| **motion (Framer Motion successor)** | live feed, pitch map, panel | Micro-animations (ball slide-ins, boundary flashes), always respecting `prefers-reduced-motion`. |
| **@anthropic-ai/sdk (Claude Haiku)** | `lib/synth/stage2.ts` | Optional Stage-2 parser for commentary lines the rules parser can't read. Feature-flagged; the app runs fully without it. |
| **Vitest** | `**/__tests__/` | ~130 tests: provider contracts, the 1,000+ line commentary corpus, the live pipeline, 3D choreography, depth math. This is the CI gate. |
| **server-only** | server modules | An import that *crashes the build* if a server file (with API keys) ever leaks into client code. |

Notably absent, on purpose: no database (Redis snapshot is the only state), no chart library (stats charts are hand-rolled server-rendered SVG), no physics engine (ball flight is scripted bezier arcs), no drei (its three features were hand-rolled in ~80 lines for a smaller bundle), no auth stack.

---

## 3. The architecture in one picture

```
                          ┌─────────────────────────────────────────────┐
                          │            EXTERNAL DATA PROVIDER            │
                          │  cricketdata.org / EntitySport / Cricsheet   │
                          │  files / bundled mock universe               │
                          └──────────────────────┬──────────────────────┘
                                                 │ polled ONCE per match
                                                 │ every 4–10s (server only)
                    ┌────────────────────────────▼────────────────────────────┐
                    │                  PROVIDER ADAPTERS                       │
                    │   lib/providers/*.adapter.ts — each implements the       │
                    │   CricketDataProvider interface; zod-validates input;    │
                    │   maps provider JSON → canonical domain types            │
                    └───────────────┬─────────────────────────┬───────────────┘
                                    │                         │
                     (request-time reads)            (live pipeline reads)
                                    │                         │
                    ┌───────────────▼──────────┐   ┌──────────▼───────────────┐
                    │  lib/data.ts             │   │  lib/live/poller.ts      │
                    │  RSC pages call these    │   │  syncMatch(): fetch →    │
                    │  request-deduped getters │   │  diff → store → publish  │
                    └───────────────┬──────────┘   └──────────┬───────────────┘
                                    │                         │
                                    │              ┌──────────▼───────────────┐
                                    │              │  lib/live/store.ts       │
                                    │              │  MemoryLiveStore (dev /  │
                                    │              │  single node) OR         │
                                    │              │  UpstashLiveStore (Redis,│
                                    │              │  serverless/multi-node)  │
                                    │              └──────────┬───────────────┘
                                    │                         │ subscribe / fan-out
                                    │              ┌──────────▼───────────────┐
                                    │              │  app/api/live/[matchId]  │
                                    │              │  SSE: snapshot once,     │
                                    │              │  then <2 KB ball deltas  │
                                    │              └──────────┬───────────────┘
                                    │                         │ EventSource
              ┌─────────────────────▼─────────┐   ┌──────────▼───────────────┐
              │  SERVER-RENDERED PAGES (RSC)  │   │  CLIENT LIVE STORE       │
              │  home, scorecard, stats, h2h, │   │  use-live-match.ts       │
              │  lineups, player, series...   │   │  (one zustand store per  │
              └───────────────────────────────┘   │  stream, shared by all)  │
                                                  └──────┬─────────┬─────────┘
                                                         │         │
                                          ┌──────────────▼──┐   ┌──▼──────────────────┐
                                          │ Commentary feed │   │ Reconstruction panel │
                                          │ live-feed.tsx   │   │ → Shot Synthesizer   │
                                          └─────────────────┘   │ → 3D stadium OR      │
                                                                │   2D pitch map       │
                                                                └─────────────────────┘
```

The one-sentence version: **adapters normalize any provider into canonical types; pages read them server-side; for live matches a server-side poller diffs new balls into a store which fans them out over SSE; on the client one shared store feeds both the text commentary and the synthesized 2D/3D reconstruction.**

Three load-bearing design decisions to internalize before touching code:

- **The canonical types in `lib/providers/types.ts` are the contract.** `BallEvent` and `SynthesizedShot` are specced verbatim in CLAUDE.md §3.3 and must not change shape without explicit approval — the synthesizer, the 2D map, the 3D choreography, and the wire protocol are all built against them.
- **Everything downstream of a `BallEvent` is pure and deterministic.** Same event in → same shot, same scene, same colors out, on server and client alike. This is why the synthesizer and choreography are testable to death and why the 2D and 3D views never disagree.
- **The provider is only ever touched server-side, once per match.** `lib/providers/index.ts` imports `server-only`; any attempt to use it from client code fails the build.

---

## 4. Where the data comes from — the backend explained

This section is the "how does data actually arrive" story, written for someone who has never built a live-data backend.

### 4.1 The four data sources

The app can run against four interchangeable sources, selected by the `DATA_PROVIDER` environment variable. All four implement the same TypeScript interface, so the rest of the app cannot tell them apart:

| `DATA_PROVIDER` | What it is | Keys needed | When you use it |
|---|---|---|---|
| `mock` *(default)* | A hand-authored, deterministic "universe" of fixtures built in code (`lib/providers/mock-data.ts`): a live IND v ENG T20I frozen mid-chase, completed and upcoming matches, an MLC points table. Rebuilt around today's date on every call so there is *always* a live match "today". | none | Local dev, tests, demos. `npm run dev` with zero config runs on this. |
| `cricsheet` | Real historical matches from [cricsheet.org](https://cricsheet.org) (open ODC-BY license). Reads raw ball-by-ball JSON files from `data/cricsheet/` and *aggregates them into full scorecards on the fly* — proving the aggregation math against messy real data. One real match ships in the repo (match id `1490706`, IND v AUS, Women's T20 WC at Lord's). | none | Development against real data; the replay feature; the integration test corpus. |
| `cricketdata` | The live API at cricketdata.org (`api.cricapi.com/v1`). Free tier = **100 requests/day**, which is why responses are TTL-cached in-process and only the server ever calls it. | `CRICKETDATA_API_KEY` | MVP real live data. |
| `entitysport` | Production-grade licensed API. Currently a **stub** that throws a clear "not configured" error — the interface is locked, the implementation lands when a token is licensed. | `ENTITYSPORT_TOKEN` | The production candidate. |

### 4.2 How a page gets data (the request path)

Pages are React Server Components. On each request the page calls a getter in `lib/data.ts` (e.g. `getScorecard(matchId)`), which resolves the active adapter via `getProvider()` and returns canonical types. React's `cache()` wraps every getter so if the layout and the page both ask for the same match in one request, the provider is hit **once**. The adapters add their own TTL caches on top (fixtures ~5 min, squads ~1 h, finished scorecards effectively forever), so a rate-limited provider is protected even across requests.

### 4.3 How live data gets to the browser (the streaming path)

This is the heart of the backend. Step by step:

1. **A browser opens a live match page.** The server renders the page with a snapshot of current state (score header, recent balls) so there is no pop-in, then the client opens an `EventSource` to `/api/live/<matchId>`.
2. **The SSE route** (`app/api/live/[matchId]/route.ts`) checks the per-IP rate limit, makes sure a state snapshot exists (`ensureSnapshot`), subscribes to the store, and starts a poll ticker for that match if one isn't already running.
3. **The ticker** (`lib/live/ticker.ts`) is *refcounted*: the first viewer starts it, the last viewer's disconnect stops it. It calls `syncMatch()` on an adaptive cadence — every 4 s while live, 60 s during an innings break, 5 min pre-match, stop when completed.
4. **`syncMatch()`** (`lib/live/poller.ts`) fetches the match header and full ball list from the provider, **diffs** against what's already stored (count-based: everything past `seen` is new), optionally enriches brand-new balls with the Stage-2 LLM parser, writes the new state to the store, and **publishes** a delta message.
5. **The store** (`lib/live/store.ts`) fans that delta out to every subscribed SSE connection. So 10,000 viewers of one match = *one* provider poll every 4 seconds, not 10,000.
6. **The wire protocol** is three SSE event types (`lib/live/types.ts`):
   - `snapshot` — full state, sent once per connection (and again on every reconnect, which is how gaps heal),
   - `ball` — a delta with only the new ball(s) plus a slim ~400-byte header (score, status text, last ball). Budget: **< 2 KB per ball**, asserted in tests,
   - `status` — header-only change (innings break, match over).
   Every message carries a monotonically increasing `version`; if the client ever sees a gap it forces a reconnect and gets a fresh snapshot.
7. **On the client**, `use-live-match.ts` keeps one zustand store per stream. The commentary feed, context bar, alerts, and the 2D/3D reconstruction all read the *same* store — one connection, many consumers.

### 4.4 The two deployment shapes for the live pipeline

The store abstraction exists because "where does live state live?" has two correct answers depending on hosting:

- **Memory mode** (default, zero config): state and pub/sub live in the Node process. Correct for `next dev` and for a single always-on server (Railway/Fly). *Not* correct for serverless — Vercel functions don't share memory and can't run persistent timers.
- **Upstash mode** (auto-selected the moment `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set): snapshots persist in Redis at `match:{id}:state`, an external writer (cron/QStash hitting `/api/sync`, or a small worker) does the polling, and each SSE instance detects new versions by polling the snapshot every 2 s (Upstash REST can't hold a SUBSCRIBE connection). Still one provider poll per match.

Section 11 turns this into a concrete production plan.

### 4.5 Replay mode — the secret weapon

Any historical match with ball data can be **replayed through the exact same pipeline** at up to 64× speed: `/match/1490706/live?replay=1490706&speed=16x`. A `ReplaySession` (`lib/live/replay.ts`) rebuilds the match ball by ball on a timer, writing into a dedicated in-memory store and publishing the same `ball` deltas a live match would. This is how you develop and demo every live feature — the SSE protocol, the feed, the synthesizer, the whole 3D engine — with **zero API keys and zero quota burn**. It's also a user-facing feature ("▶ Watch replay" on finished matches). Bundled Cricsheet matches resolve under *any* provider thanks to the fallback in `lib/providers/fallback.ts`.

---

## 5. The complete file-by-file walkthrough

Every source file, what it exports, and why it exists. Files are grouped by layer, in the order data flows.

### 5.1 `lib/providers/` — the data layer

#### [types.ts](lib/providers/types.ts) — the canonical domain contract
The single most important file in the repo. Everything speaks these types. Highlights:

- **`Fixture`** — one match in a list: teams, venue, `status` (7-state union: `upcoming | live | innings-break | stumps | completed | abandoned | no-result`), `statusText` (the human line like *"England need 98 off 52 balls"*), `innings: InningsSummary[]`, and `lastBall` — the honest latency anchor shown instead of a fake instant-LIVE dot.
- **`InningsSummary`** — `runs`, `wickets`, `oversText` ("18.4" for display) **and** `legalBalls` (112, the number all rate math trusts — never parse the display string for math).
- **`MatchDetail extends Fixture`** — adds toss, officials, result text, series status, player of the match.
- **`Scorecard` / `InningsScorecard`** — full batting (`BattingEntry`: runs, balls, 4s, 6s, SR, dismissal text, order) and bowling (`BowlingEntry`) tables, `FallOfWicket[]`, `ExtrasBreakdown`, yet-to-bat.
- **`Squads`, `SquadPlayer`** — includes `battingHand`, which the synthesizer uses to mirror the wagon wheel for left-handers.
- **`PlayerProfile`** — career batting/bowling stats per format.
- **`BallEvent`** — one delivery: `(innings, over, ball)` position, bowler/batter/non-striker ids, `runs {batter, extras, total}`, optional `extraType` and `wicket {kind, playerOutId, fielderIds}`, the raw `commentaryText`, and the optional `synth?: SynthesizedShot` slot (only ever filled by *our* synthesizer, never a provider). **Specced verbatim in CLAUDE.md — do not modify without approval.**
- **`SynthesizedShot`** — the synthesizer's output: `deliveryType` (pace/spin), `length`, `line`, `shotType` (12 values from `defend` to `run-out-scramble`), `wagonZone` (1–8, zone 1 = fine leg for a right-hander), `trajectory` (ground/flat/lofted/skier), `landingRadius` (0..1 of boundary distance), optional `fielderRole`, `runsScored`, `isBoundary`, and `confidence` (0..1 — below 0.5 the renderer uses a generic conservative animation).
- **`FIELDING_POSITIONS`** — the canonical 40-position dictionary (`"sweeper-cover"`, `"cow-corner"`, …) as a `const` array; `FieldingPosition` is its union type.
- **`WicketKind`** — all 14 dismissal kinds, aligned with Cricsheet's vocabulary.

#### [provider.interface.ts](lib/providers/provider.interface.ts)
The `CricketDataProvider` interface — 8 methods (`getFixtures`, `getSeries`, `getMatch`, `getScorecard`, `getBallByBall`, `getSquads`, `getPlayer`, `getPointsTable`). Every adapter implements exactly this. Also exports `ProviderName`.

#### [index.ts](lib/providers/index.ts) — the registry
The **only** place a data source is resolved. `resolveName()` reads `DATA_PROVIDER` (unknown values warn and fall back to `mock`); `getProvider()` returns a singleton adapter instance stashed on `globalThis` so in-process caches survive dev hot-reload. Imports `server-only` — this is the wall that keeps API keys off the client.

> **Pattern note:** you'll see the `globalThis.__stadiumx*` singleton trick in several files (provider, live store, tickers, replay sessions, rate limiter, Stage-2 cache). Next.js dev mode re-evaluates modules constantly; module-level state would be wiped on every hot reload. Hanging it off `globalThis` keeps caches, timers and connections stable in dev, and is harmless in production.

#### [mock.adapter.ts](lib/providers/mock.adapter.ts) + [mock-data.ts](lib/providers/mock-data.ts)
`MockAdapter` serves the deterministic universe built by `buildMockUniverse(now)` — rebuilt per call (cheap) so the live match is always pinned to "today". Takes an injectable `now` clock so tests can freeze time. `mock-data.ts` is the large hand-authored dataset: the reference IND v ENG T20I with real Cricbuzz-register commentary lines (including the exact "Deceives him with a googly… stumped" scene from the spec), MLC fixtures, squads, player profiles, and the points table.

#### [cricsheet.adapter.ts](lib/providers/cricsheet.adapter.ts) + [cricsheet.schema.ts](lib/providers/cricsheet.schema.ts)
Reads every `*.json` in `CRICSHEET_DIR` (default `data/cricsheet/`), zod-validates each file (`cricsheetMatchSchema`), and caches the parsed map. Its real work is **aggregation**: Cricsheet files are just raw deliveries, so this adapter walks them to build innings summaries, full batting/bowling scorecards, fall of wickets, extras breakdowns, and canonical `BallEvent`s (it also *generates* commentary-like text for each delivery since Cricsheet has none). A missing directory throws `ProviderNotConfiguredError` with a helpful hint; an invalid file throws `ProviderResponseError` naming the file.

#### [cricketdata.adapter.ts](lib/providers/cricketdata.adapter.ts) + [cricketdata.schema.ts](lib/providers/cricketdata.schema.ts)
The live-API adapter. The private `call<T>(endpoint, params, schema, ttlMs)` method is the whole story: build URL with the API key, check the in-process TTL cache, fetch, validate the `{status, data}` envelope, zod-parse the payload, cache, return. Every public method maps provider JSON → canonical types (status strings → `MatchStatus`, score arrays → `InningsSummary[]`, etc.). Constructor takes injectable `fetchImpl` and `now` so contract tests run against recorded fixtures in `__fixtures__/cricketdata/` without network.

#### [entitysport.adapter.ts](lib/providers/entitysport.adapter.ts)
Deliberate stub: every method rejects with `ProviderNotConfiguredError` and a hint. Exists so the switch in the registry is exhaustive and the production slot is visibly reserved.

#### [errors.ts](lib/providers/errors.ts)
Typed failures so UI error states can be *designed*, not generic: `ProviderError` (base, carries `provider` name), `ProviderNotConfiguredError` (setup problem), `ProviderResponseError` (upstream garbage), `MatchNotFoundError`, `PlayerNotFoundError`. The guards (`isMatchNotFoundError` etc.) check `err.name`, **not** bare `instanceof` — the dev bundler can instantiate this module once per compilation layer, and an error built by one copy isn't `instanceof` the other. That bug actually broke the designed 404 in dev while production worked; the comment in the file tells the story.

#### [fallback.ts](lib/providers/fallback.ts)
`withCricsheetFallback(run)` — runs an operation against the active provider; if (and only if) it throws `MatchNotFoundError`, retries against a singleton Cricsheet adapter. This is why `/match/1490706/...` (the bundled real match) works even in mock mode. If the fallback can't help, the *original* error propagates so error states stay truthful.

#### [util.ts](lib/providers/util.ts)
Shared mapping helpers: `isAfterBall` (strict (innings, over, ball) ordering — with the documented caveat that wides share a ball number), `slugify`, `shortNameFor` ("MI New York" → "MNY"), `teamRefFromName` (+ the country-code table that powers emoji flags), `toMatchFormat` (provider format strings → canonical `MatchFormat`).

### 5.2 `lib/live/` — the real-time pipeline

#### [types.ts](lib/live/types.ts)
The wire protocol and stored state. `LiveHeader` is the compact per-ball header (~300–500 B). `WireSnapshot` / `WireDelta` / `WireStatus` are the three SSE message shapes; `LiveState` is what the store holds (version-tagged `StoredEvent[]`, plus `seen` — the count of provider events ever consumed, which is the diff anchor and survives event-window trimming). Constants: `EVENT_CAP = 400` (stored history; a T20 is ~260 balls), `SNAPSHOT_EVENT_CAP = 120` (history sent on connect — enough to scroll, light to send). `toWireSnapshot(state)` builds the connect-time message, folding the live header back into the `detail` so a client that only reads `detail` is still current.

#### [poller.ts](lib/live/poller.ts)
- `pollIntervalMs(status)` — the adaptive cadence table (live 4 s / break & stumps 60 s / upcoming 5 min / done 0 = stop).
- `syncMatch(matchId, store, source)` — **the** normalize→diff→store→publish step described in §4.3. First sync stores up to `EVENT_CAP` history without publishing (nobody is subscribed yet); later syncs slice `all.slice(existing.seen)` as fresh, pass fresh balls through `enrichEvents` (Stage-2, a no-op without a key), bump `version`, and publish a `ball` or `status` message. A provider feed that suddenly *shrinks* (reset) is treated as "no new balls", never as fresh history.
- `ensureSnapshot()` — create-if-missing, used by the SSE route before the first snapshot goes out.

#### [ticker.ts](lib/live/ticker.ts)
The refcounted per-match poll loop for **memory mode** (with Upstash, `/api/sync` is the writer and `attachTicker` only counts refs). `attachTicker`/`detachTicker` manage a `Map<matchId, {refs, timer, running}>` on `globalThis`; `schedule()` chains `setTimeout`s using each sync's `nextPollMs`, backs off to 15 s on provider errors, and stops when the match completes or the last viewer leaves.

#### [store.ts](lib/live/store.ts)
The `LiveStore` interface (`get`/`set`/`publish`/`subscribe`) and `MemoryLiveStore` (two Maps; publish loops listeners, and one broken listener can't break fan-out to the rest). `getLiveStore()` picks Upstash iff both env keys are set. `getReplayStore()` is always a separate `MemoryLiveStore` — replay sessions are driven by a local timer, so they're single-instance by nature.

#### [upstash-store.ts](lib/live/upstash-store.ts)
`UpstashLiveStore` speaks Upstash's REST protocol directly (a `command()` helper POSTs `["SET", key, value, "EX", ttl]`-style arrays — no client library needed). Snapshot key: `match:{id}:state`, 6-hour TTL. `publish` is a documented no-op; `subscribe` polls the snapshot version every 2 s and synthesizes `ball` deltas from the version-tagged event log. Covered by deploy-time verification, not the unit suite (needs a real Redis).

#### [replay.ts](lib/live/replay.ts)
`ReplaySession` — the replay engine (§4.5). Key mechanics: sessions are keyed `replay:{matchId}:{speed}x` so viewers at the same speed **watch together**; `attach()`/`detach()` refcount viewers (pause on last leave, resume on next join, auto-rewind after the end); `tick()` advances one step — emitting a one-tick `innings-break` status before a new innings, evolving innings math via `applyEventToInnings`, publishing one `ball` per tick, and a final `completed` status. `parseSpeed` clamps to 1–64× ("8x" and "8" both parse). `BASE_BALL_MS = 40_000` — real T20 cadence — divided by speed, floored at 300 ms. `acquireReplaySession()` is the global registry entry point; a failed load is evicted so it can retry.

#### [header.ts](lib/live/header.ts)
Pure innings math, safe on client and server: `headerFromDetail` (trust a real provider's header as-is), `inningsTeamResolver` (who bats innings N — known summaries, else alternate), `applyEventToInnings` (add runs, count wickets, advance legal balls — wides/no-balls don't advance), `buildHeader` (derive status text for replayed states, including the chase sentence via `chaseState`), and `initialSnapshot` (the server-rendered seed for the client store — **version 0**, so the real SSE snapshot, version ≥ 1, always supersedes it).

#### [source.ts](lib/live/source.ts)
`liveSource` — provider access for the pipeline *without* React `cache()` (pollers run outside any request scope, where request-memoization is meaningless). Same Cricsheet fallback as `lib/data.ts`. Also the injection seam: tests pass a fake `LiveSource`.

#### [outcome.ts](lib/live/outcome.ts)
Tiny classifier: `ballOutcome(event)` → which badge a feed row gets (W / 4 / 6 / wide / …). Kept separate so the feed row and alerts agree.

#### [rate-limit.ts](lib/live/rate-limit.ts)
Anonymous per-IP limiter for the SSE endpoint: max **30 connection attempts/min** and **6 concurrent streams** per IP. `clientIp()` reads `x-forwarded-for`. `acquireStream()` returns a `Permit` whose idempotent `release()` decrements the concurrent count on disconnect. In-memory — correct for the single-instance story; swap for a Redis limiter when multi-instance.

### 5.3 `lib/synth/` — the Shot Synthesizer (the core IP)

This is the module CLAUDE.md calls "THE core IP — build this with the most care". It converts a `BallEvent` (mainly its `commentaryText`) into a `SynthesizedShot`. It is pure, deterministic, and gated by a 1,000+ line test corpus asserting **≥ 80% of balls parse at confidence ≥ 0.7** (currently ~95.6%).

#### [lexicon.ts](lib/synth/lexicon.ts)
The vocabulary of cricket prose, as ordered phrase tables:
- `SHOT_GROUPS` — verb phrases → the 12 `shotType`s, **in match-priority order**: edges and misses outrank attacking verbs (in "goes for the pull, top edges it", the *result* of the swing is what we animate), specific strokes outrank the generic drive/defend catch-alls. Covers the full register: "creams/caresses" → drive, "mows/heaves" → slog, "feathers/snicks" → edge, "shoulders arms" → leave, ramps/scoops/switch-hits → sweep family, etc.
- `LENGTH_GROUPS`, `LINE_GROUPS` — "short of a length", "yorker", "full toss" → length; "on off stump", "down leg" → line.
- `SPIN_WORDS` / `PACE_WORDS` — "googly", "leg-break", "flatter" vs "seam", "bouncer", "150kph".
- `TRAJECTORY_GROUPS` — "along the ground" / "lofted, goes downtown" / "top edge, skies it".
- `ADVANCE_WORDS` — "dances down", "charges" (feeds the stumping scene).

House rule written at the top of the file: a word only enters a list when it *reliably* means that thing in real commentary. Ambiguous words stay out — "wrong-but-plausible beats flashy-but-absurd".

#### [field.ts](lib/synth/field.ts)
Field geometry. The coordinate system (used by the 2D map and 3D engine too): **angle in degrees from straight down the ground; positive sweeps to a right-hander's leg side; radius is 0..1 of boundary distance.**
- `FIELD_SPOTS` — polar coordinates for all 40 canonical positions (keeper at 180°/0.05, sweeper-cover at −62°/0.92, cow-corner at 38°/0.95 …).
- `POSITION_ALIASES` — every spoken form commentary uses ("45", "third man", "backward point") → canonical id; matched longest-phrase-first so "sweeper cover" beats "cover".
- `findFieldingPosition(text)` / `findDirectionalAngle(text)` — extract placement evidence from a normalized line (`findDirectionalAngle` handles direction-carrying stroke names like "cover drive" or "hook" when no fielder is named).
- `mirrorAngle(angle, hand)` — the left-hander flip.
- `zoneOfAngle(angle)` / `ZONE_CENTER_ANGLE` — the 8-zone wagon wheel mapping (zone 1 = fine leg for a right-hander).

#### [synthesize.ts](lib/synth/synthesize.ts) — Stage 1, the rules parser
`synthesizeShot(event, ctx?)` in one pass:
1. **Normalize** the text (lowercase, punctuation → spaces, padded for whole-word matching).
2. **Score evidence** with the `WEIGHT` table: base 0.32; a shot verb +0.26; a named fielder +0.24; delivery/length/line/trajectory words +0.08–0.09 each; structured wicket kinds +0.3 (they fully determine the scene); capped at 0.98. A rich Cricbuzz line lands ≈ 0.85–0.98; a bare "no run" stays under the 0.5 generic-animation threshold. **These weights are tuned against the corpus gate — change them only with the test suite watching.**
3. **Longest-match parsing** via `matchGroups` ("short of a length" beats "length ball"; ties go to the earlier, higher-priority group).
4. **Wicket scenes from structured data**: bowled → "chopped on" becomes played-on-off-the-edge, a beaten bat becomes a clean miss; lbw → the attempted stroke (sweep/pull/miss); stumped → miss (+ advance bonus if the text says "dances down"); run out → scramble; caught → any edge vocabulary wins, else infer from where the catcher stood (behind-the-wicket catchers ⇒ edge, deep catchers ⇒ loft).
5. **Extras without a stroke**: wide → missed (+ line wide-off), bye → leave, legbye → missed (off the body).
6. **Conservative fallbacks** for silent text: 6 → loft, runs → drive, dot → defend; length/line inferred from the stroke at *zero* confidence weight (pulls come off short balls, sweeps off full ones).
7. **Zone & radius**: a named fielder pins the exact angle and radius (a boundary "past sweeper cover" still reaches the rope); else a directional stroke angle; else the shot's default zone. `radiusForRuns` maps outcome → distance (dot-defend ≈ 0.08, single ≈ 0.45, boundary = 1).
8. **Outcome cross-checks**: 6 forces radius 1 + lofted/skier; 4 forces radius 1; bowled/lbw/stumped pin the ball at the stumps.

Helper worth knowing: `physicalRuns(event)` — the number of times the batters *physically run* (byes/legbyes are run, the wide itself isn't) — this drives the run animation, separate from scoreboard runs.

`shotFor(event, ctx?)` — the accessor everything renders through: returns `event.synth` if a smarter stage already attached one, else computes Stage 1 on the spot. This is why Stage 2 needed **zero** UI changes.

#### [scene.ts](lib/synth/scene.ts)
Shared shot-scene geometry for every 2D consumer: `shotSeed` (deterministic per-ball jitter so accumulated wagon wheels fan out organically), `shotAngle` (named fielder pins the angle, sign-corrected for the left-hander mirror; else zone center; plus jitter), `outcomeColor` (the semantic palette: wicket `#E5484D`, four `#3B82F6`, six `#8B5CF6`, runs gold `#F5B82E`, dot neutral).

#### [stage2.ts](lib/synth/stage2.ts) — the LLM fallback
For balls Stage 1 scores **< 0.5** (`STAGE2_THRESHOLD`), one Claude Haiku call with a strict JSON schema (structured outputs). Everything about it is defensive:
- **Flag**: enabled iff `ANTHROPIC_API_KEY` is set and `SYNTH_LLM !== "0"` (`isStage2Enabled`).
- **Cache**: keyed by `commentaryHash` (sha256 of trimmed lowercase text), capped at 2,000 entries, on `globalThis`. Failures are cached as `null` so one bad line can't burn budget every poll.
- **Budget**: `MAX_CALLS_PER_BATCH = 4` per poll delta.
- **Validation**: the response is zod-parsed (`shotSchema`) and then **reconciled against facts** (`reconcileShot`): a six forces lofted + radius 1, a non-boundary is clamped to radius ≤ 0.9, confidence is clamped to [0.55, 0.9] — actionable, but never claiming rules-parser certainty.
- **Failure = pass-through**: `enrichEvents` never throws; an unenrichable event flows on untouched and the client renders the conservative Stage-1 shot.
- **Injection seam**: `Stage2Caller` lets tests drive the whole contract with a fake LLM; the real SDK caller lives behind a lazy dynamic import.

#### [index.ts](lib/synth/index.ts)
The public barrel: `synthesizeShot`, `shotFor`, `normalizeText`, and the field geometry exports.

### 5.4 `lib/depth/` — ratings, stats, head-to-head

All pure functions from canonical types to render-ready data; all tested in `lib/depth/__tests__/depth.test.ts`.

#### [ratings.ts](lib/depth/ratings.ts)
The FotMob-style **0–10 live match rating**, computed from the scorecard alone (works live and finished, on every provider). Start at 5.0; batting adds `runs × 0.06` (cap 3.2) plus a strike-rate-vs-format-par bonus weighted by balls faced (the `PAR` table: T20 par SR 130 / econ 8.0, ODI 88 / 5.6, …); a golden duck costs 0.75. Bowling adds `wickets × 1.05` (cap 3.5), maidens, and an economy-vs-par bonus weighted by balls bowled. `fieldingCredits` parses dismissal strings ("c **Salt** b Rashid", "st **Buttler**…", "run out (**Livingstone**)") by surname — a heuristic, but dismissal text is the only fielding signal a scorecard carries. Honesty rule: a player with **no involvement has no rating** (absent from the map), never a fake 5.0 badge.

#### [stats.ts](lib/depth/stats.ts)
Chart builders + the honesty gate:
- `inningsBallCoverage(events, innings)` — do the events *foot* against the scorecard (total runs and legal balls both match)? Worm and Manhattan render **only** when true; a provider holding just a recent window gets an honest "withheld" note instead of a silently wrong chart.
- `wormSeries` (cumulative runs by legal-ball progress; wicket points marked), `manhattanSeries` (runs + wickets per over), `partnershipSeries` (rebuilt from fall-of-wickets + batting order — works from the scorecard alone, no ball data needed), plus per-batter wagon-wheel and per-bowler line/length scatter builders that reuse the synthesizer.

#### [h2h.ts](lib/depth/h2h.ts)
Rivalry facts derived **purely from `Fixture`s** — no new provider methods. `winnerTeamId` reads the result-sentence convention ("India won by 24 runs" starts with the winner's name). `seriesDateKeys` computes the date window to scan, hard-capped at 21 days so a rate-limited provider is never hammered. `buildHeadToHead` reduces the fixture haul to meetings, win counts, last-5 form pills per team (newest first), and at-this-venue records.

### 5.5 `lib/` root helpers

#### [format.ts](lib/format.ts)
Pure cricket math + display formatting, unit-tested: `formatOvers` (112 → "18.4") / `oversToBalls` (inverse), `runRate`, `strikeRate`, `scoreLine` ("189/7"; all-out shows plain "189"), **`chaseState`** (the 2nd-innings chase equation: target, runs needed, balls remaining, required rate) and **`chaseSentence`** ("England need 98 off 52 balls" — the context line Cricbuzz fumbles, done beautifully). Date helpers: `dateKey`, `isValidDateKey` (guards the `/matches/[date]` route), `addDays`, `dayLabel` (Yesterday/Today/Tomorrow/"Fri 4 Jul"), `venueLocalTime`/`venueLocalDate` (honest venue-local times with timezone labels), `ballLabel`.

#### [data.ts](lib/data.ts)
The RSC-facing data access described in §4.2. Every getter is `cache()`-wrapped; match-scoped getters go through `withCricsheetFallback`; `getMatchOr404` maps `MatchNotFoundError` to Next's `notFound()` (→ the designed 404) while other failures bubble to `error.tsx`.

#### [cn.ts](lib/cn.ts)
The standard `clsx` + `tailwind-merge` class combiner every component uses.

### 5.6 `app/` — every route explained

All pages are React Server Components (client interactivity lives in `components/`). Live-data pages export `dynamic = "force-dynamic"` because scores change every request.

| Route file | What it renders |
|---|---|
| [layout.tsx](app/layout.tsx) | Root shell: fonts, metadata, theme, bottom nav, PWA service-worker registration, Cricsheet attribution footer. |
| [globals.css](app/globals.css) | Tailwind v4 design tokens — the palette from CLAUDE.md §7 (`night` #0A0E12 background, `card` #141A21 surfaces, `edge` borders, `gold` #F5B82E accent, semantic wicket/four/six colors), score typography (tabular numerals), motion keyframes (`live-pulse`, `fade-up`), reduced-motion guards. |
| [(home)/page.tsx](app/(home)/page.tsx) | Match Day home: fetches today's fixtures, picks the first live match as the `FeaturedHero`, renders the sticky `DateStrip`, the `LiveFilterPill` (`?live=1` shows live only), and series-grouped `MatchDayList`. `(home)` is a route group — it organizes files without affecting the URL. |
| [(home)/loading.tsx](app/(home)/loading.tsx) | Skeletons matching the final layout (no spinner). |
| [matches/[date]/page.tsx](app/matches/[date]/page.tsx) | Any day's fixtures; validates the date key (invalid → designed 404). [matches/page.tsx](app/matches/page.tsx) redirects to today. |
| [series/page.tsx](app/series/page.tsx) | Series index + points tables (`getSeries` + `getPointsTable`). |
| [match/[matchId]/layout.tsx](app/match/[matchId]/layout.tsx) | The shared match shell: fetches `MatchDetail` **once** (request-deduped with the page's own fetch), renders the sticky `ScoreHeader` + tab bar, and builds SEO metadata ("IND 189/7 · ENG 92/3 — …"). Tab switches never refetch the header. |
| [match/[matchId]/page.tsx](app/match/[matchId]/page.tsx) | No UI — redirects to `/live` or `/info` based on match state. |
| [match/[matchId]/live/page.tsx](app/match/[matchId]/live/page.tsx) | **The USP screen.** Three branches: live-or-replay → `ReconstructionPanel` + `MatchAlerts` + `LiveFeed`, seeded with a server-rendered `initialSnapshot` (real live matches hydrate with no pop-in; replay sessions start empty because they're built on connect); upcoming → designed "Not started yet" with venue-local first-ball time; completed → final deliveries + the "▶ Watch replay" button when full ball data exists. |
| [match/[matchId]/scorecard/page.tsx](app/match/[matchId]/scorecard/page.tsx) | Full batting/bowling tables, extras, FoW, yet-to-bat (`ScorecardTables`), every player name linked to their profile. |
| [match/[matchId]/lineups/page.tsx](app/match/[matchId]/lineups/page.tsx) | Both XIs on a field graphic with live ratings (`matchRatings`) and the tap-for-bottom-sheet player detail. Designed "XIs not announced" for upcoming games. |
| [match/[matchId]/stats/page.tsx](app/match/[matchId]/stats/page.tsx) | Worm, Manhattan, partnerships, per-batter wagon wheels, per-bowler pitch maps — all server-rendered SVG via `components/charts/`, gated by `inningsBallCoverage`. |
| [match/[matchId]/h2h/page.tsx](app/match/[matchId]/h2h/page.tsx) | Rivalry summary, form pills, meetings, at-this-venue — via `lib/depth/h2h.ts`. |
| [match/[matchId]/info/page.tsx](app/match/[matchId]/info/page.tsx) | Toss, venue, officials, series status. |
| [match/[matchId]/error.tsx](app/match/[matchId]/error.tsx) / [loading.tsx](app/match/[matchId]/loading.tsx) | Designed error state ("Scorecard delayed — provider hiccup") with retry; layout-matching skeletons. |
| [player/[playerId]/page.tsx](app/player/[playerId]/page.tsx) | Server-rendered career batting/bowling tables per format (view-source shows the numbers — zero JS required). Unknown id → designed 404. |
| [offline/page.tsx](app/offline/page.tsx) | The PWA offline shell ("Rain delay — you're offline"), precached by the service worker. |
| [not-found.tsx](app/not-found.tsx) | The designed 404 ("Gone — over the ropes"). |
| [manifest.ts](app/manifest.ts) | PWA manifest (name, colors, icons) — makes the app installable. |
| [api/live/[matchId]/route.ts](app/api/live/[matchId]/route.ts) | **The SSE endpoint** — see §4.3. Order of operations matters and is worth reading in the source: rate-limit permit → attach replay session *or* ensure snapshot + attach ticker → `retry: 3000` hint → **subscribe before reading the snapshot** (anything published in between is buffered, then flushed if newer — no lost balls) → snapshot → deltas → 15 s `: ping` keep-alives. Errors map to designed JSON: 404 unknown match / replay unavailable, 429 rate-limited, 502 provider failure. A `cleanups` array guarantees permits, tickers and sessions are released exactly once on any teardown path. |
| [api/sync/route.ts](app/api/sync/route.ts) | The external poll trigger for serverless deployments (§4.4, §11). GET/POST; optional `SYNC_SECRET` bearer auth; syncs one match (`?matchId=`) or every live match today; returns a JSON report (`{store, count, synced:[{matchId, version, newEvents, nextPollMs}]}`). |

### 5.7 `components/` — every component explained

#### `components/live/` — the client half of the pipeline
- [use-live-match.ts](components/live/use-live-match.ts) — **the** client store. A module-level registry maps `streamPath` → `{zustand store, EventSource, refcount}`; the first mount opens the connection, later mounts share it, the last unmount closes it. Handles: seeding from the server snapshot (version 0), applying `ball`/`status` deltas in version order, **detecting version gaps and force-reconnecting** (the fresh snapshot heals everything), distinguishing browser-managed retries from hard-closed connections, and the `ended` state (stream closed cleanly when a match finishes). Also tracks `snapshotVersion` — events newer than it arrived live and are the only ones that *animate* in (snapshot backlog never triggers animations or notifications).
- [use-playhead.ts](components/live/use-playhead.ts) — a tiny per-stream vanilla-zustand store carrying the key of the ball the stadium is *currently reconstructing*. The panel writes it; the feed reads it to highlight + auto-scroll the matching row, so commentary and stadium stay in lockstep. Vanilla store (not React context) so a near-60fps write only re-renders subscribers of the key.
- [live-feed.tsx](components/live/live-feed.tsx) — the Cricbuzz-parity commentary feed: over-grouped rows with W/4/6 badge chips (via `ballOutcome`), Motion slide-ins for new balls (reduced-motion aware), the connection chip (LIVE pulse / Connecting / Reconnecting / ENDED), and the sticky **context bar**: score, overs, CRR, RRR/chase sentence, and the honest "Last ball 18.4" anchor.
- [match-alerts.tsx](components/live/match-alerts.tsx) — the Alerts bell: requests Notification permission and fires local notifications for wickets/boundaries as **deltas** arrive (never for snapshot backlog). The stepping stone to real web push.

#### `components/pitch/` — the 2D reconstruction (Phase 3, and the permanent fallback)
- [pitch-map.tsx](components/pitch/pitch-map.tsx) — the top-down SVG field. `landingPoint()` solves the ray-ellipse intersection so an angle + 0..1 radius maps to screen coordinates; the golden ball-trail animates out to the landing point; boundaries flash the rope; sixes burst in the stands; wickets pulse red; every scoring shot accumulates into the innings wagon wheel. `playbackMillis(shot)` tells the panel how long a 2D scene lasts (~2–3 s by trajectory). Exports the `PlayableBall` type (`{key, event, shot}`) both views consume.
- [reconstruction-panel.tsx](components/pitch/reconstruction-panel.tsx) — the orchestrator above both views. Owns the **playback queue**: snapshot history renders instantly as the wagon wheel; each *delta* ball plays as a timed scene; events arriving faster than playback queue up behind a "⏩ N balls behind" skip chip. Decides 3D vs 2D (WebGL support × `prefers-reduced-motion` × the user's persisted 2D/3D toggle in `localStorage["sx-view-mode"]`), renders the event pill ("FOUR! Kohli" / "WICKET · stumped"), the scene caption ("Cut to sweeper cover"), camera preset buttons (TV/Bat/Bird/Free), the collapse chevron, and low-confidence honesty ("generic reconstruction"). Writes the playhead. When a stream is static (frozen demo match) it ambient-loops the last over so the panel is never dead.

#### `components/stadium/` — the 3D engine (Phase 4)
Split so that **everything schedulable is pure TS in the main bundle, and everything three.js lives in a lazy chunk**:
- [choreography.ts](components/stadium/choreography.ts) — *pure TS, no three.js imports, fully unit-tested.* Turns `BallEvent` + `SynthesizedShot` into a timed scene: world-space constants (pitch along Z, striker at `z=+10.06`), `boundaryDistance`/`fieldPoint` (ray-ellipse math in meters), `angleForShot` (same fielder-pins-angle logic as 2D — the two views agree ball for ball), `fieldPreset` (powerplay ring / spin field / death spread by match phase), `placeFielders` (the commentary-named fielder replaces the angularly-nearest preset slot), and the scene builder producing timed phases per CLAUDE.md §5.3: run-up → release → pitch bounce → swing → bezier flight → runs shuttled / rope flash / six confetti / wicket mini-scenes (bowled = stumps explode, stumped = advance-miss-stump, caught = gather at catching height). `playbackMillis3D` gives the panel scene durations *before* the 3D chunk loads.
- [stadium-types.ts](components/stadium/stadium-types.ts) — shared types (`StadiumSceneProps`, `CameraPreset`, actor projections) so the main bundle never imports the heavy module for a type.
- [stadium-view.tsx](components/stadium/stadium-view.tsx) — the main-bundle gateway: `supportsWebGL()` probe, a floodlit loading skeleton, and `next/dynamic(() => import("./stadium-scene"), { ssr: false })` — the line that keeps three.js out of the initial payload.
- [stadium-scene.tsx](components/stadium/stadium-scene.tsx) — the r3f `<Canvas>` (the lazy chunk): camera rigs for the four presets (broadcast follows the ball after contact; Free is hand-rolled drag-orbit + wheel zoom), the emissive golden ball + fading trail, lighting per venue theme, DPR clamped at 1.5, `frameloop="demand"` when idle, no shadow maps (blob shadows), no postprocessing.
- [stadium-ground.tsx](components/stadium/stadium-ground.tsx) — the parametric stadium: boundary ellipse from the theme's `rx/rz`, two seating tiers, roof band, floodlight towers, sight screens, landmark structures. Crowd and outfield textures are **painted into runtime canvases — downloaded 3D assets: 0 bytes**.
- [players.tsx](components/stadium/players.tsx) — procedural low-poly players (~300 triangles, code-driven joint rig). The six "clips" are pose functions: bowl windmill (pace/spin), vertical/horizontal bat swings, keeper crouch, gather/catch, celebrate, run. Kits take real team colors from the live stream; the 9 outfielders are instanced.
- [venue-theme.ts](components/stadium/venue-theme.ts) — pure data: the venue table (Wankhede, MCG, Eden Gardens, Lord's…) with boundary semi-axes, day/night lighting, stand/roof/crowd palettes, and signature landmarks (Lord's gets its pavilion + media pod). Unknown venues get a deterministic hash-derived skin so two unknown grounds still look like two different places.
- [live-stats.ts](components/stadium/live-stats.ts) — derives batter/bowler mini-stat lines and milestone callouts (fifty/hundred) from the event stream for the panel's overlays.
- [__tests__/](components/stadium/__tests__/) — choreography timing bands, flight start/end points, six apex, wicket scene shapes, runner counts, ambiguity clamping, fielder presets, venue theming — all CI-asserted without WebGL.

#### The rest of `components/`
- `home/` — [date-strip.tsx](components/home/date-strip.tsx) (sticky horizontal day selector), [featured-hero.tsx](components/home/featured-hero.tsx) (the live hero card with mini field render + chase line), [match-day.tsx](components/home/match-day.tsx) (series-grouped fixture cards + the Live filter pill), [match-row.tsx](components/home/match-row.tsx) (one fixture row: flags, scores, status chip).
- `match/` — [score-header.tsx](components/match/score-header.tsx) (the sticky match header + tab bar), [tab-bar.tsx](components/match/tab-bar.tsx), [scorecard-tables.tsx](components/match/scorecard-tables.tsx), [recent-balls.tsx](components/match/recent-balls.tsx), [coming-soon.tsx](components/match/coming-soon.tsx).
- `charts/` — Phase 5's server-rendered SVG charts, zero chart-library bytes: [worm-chart.tsx](components/charts/worm-chart.tsx), [manhattan-chart.tsx](components/charts/manhattan-chart.tsx), [partnership-bars.tsx](components/charts/partnership-bars.tsx), [wagon-wheel.tsx](components/charts/wagon-wheel.tsx), [pitch-scatter.tsx](components/charts/pitch-scatter.tsx). All take pre-built series from `lib/depth/stats.ts`, use the semantic outcome colors, and carry `<title>` tooltips + legend/shape secondary encodings (CVD-checked).
- `lineups/` — [lineups-view.tsx](components/lineups/lineups-view.tsx): XIs on the field graphic, initials avatars in team colors (no unlicensed photos — CLAUDE.md §12), rating badges, team switcher, and the player bottom sheet with today's lines + that player's personal wagon wheel.
- `nav/` — [bottom-nav.tsx](components/nav/bottom-nav.tsx): the FotMob-style mobile tab bar.
- `ui/` — [skeleton.tsx](components/ui/skeleton.tsx), [status-chip.tsx](components/ui/status-chip.tsx) (LIVE pulse / FT / start time), [team-flag.tsx](components/ui/team-flag.tsx) (emoji flag or color monogram).
- `brand/` — [logo.tsx](components/brand/logo.tsx) (wordmark with the golden ball-trail motif).
- `pwa/` — [register-sw.tsx](components/pwa/register-sw.tsx): registers `/sw.js` **in production builds only** (dev caching is a debugging nightmare).

### 5.8 Config files, tests, and everything else

| File | What it does |
|---|---|
| [package.json](package.json) | Scripts: `dev`, `build`, `start`, `test` (vitest run), `test:watch`, `typecheck` (`tsc --noEmit`), `lint`. Node ≥ 18.18. |
| [next.config.ts](next.config.ts) | `reactStrictMode: true`; ESLint skipped during builds (lint is its own script — the build gate is tsc + vitest). |
| [tsconfig.json](tsconfig.json) | `strict` + `noUncheckedIndexedAccess` (every array index is `T \| undefined` — you'll write `?? fallback` a lot; that's intentional), `@/*` path alias. |
| [vitest.config.ts](vitest.config.ts) | Node environment; picks up `**/__tests__/**/*.test.ts`; aliases `@` to the repo root and stubs the `server-only` package (`test/stubs/server-only.ts`) so server modules can be unit-tested. |
| `sw.js` (repo root → served at `/sw.js`) | The service worker: network-first for navigations with the `/offline` shell as fallback, cache-first for hashed static assets, and `/api/*` is **never touched** — live data must never be stale. |
| [eslint.config.mjs](eslint.config.mjs) / [postcss.config.mjs](postcss.config.mjs) | next/core-web-vitals lint rules; Tailwind v4 PostCSS plugin. |
| `data/cricsheet/1490706.json` | The bundled real match powering replay demos and integration tests. Drop more Cricsheet JSON files here to add replayable matches. |
| `lib/providers/__fixtures__/` | Recorded real API responses (cricketdata) + the Cricsheet sample — contract tests run against these, never the network. |

**The test suites** (run with `npm test`, ~130 tests):

| Suite | What it locks down |
|---|---|
| `lib/providers/__tests__/provider.contract.test.ts` | Cross-adapter invariants: every adapter's scorecard **foots** (batter runs + extras = total; FoW ≤ wickets; overs math consistent). |
| `lib/providers/__tests__/cricketdata.adapter.test.ts` | Provider JSON → canonical mapping against recorded fixtures; TTL cache behavior; envelope failures. |
| `lib/providers/__tests__/format.test.ts` | The cricket math (overs, chase equations, date keys). |
| `lib/synth/__tests__/synthesize.test.ts` + `corpus.ts` | **The product gate**: ~250 hand-written Cricbuzz-register lines + generated sweeps + both CLAUDE.md reference deliveries asserted field by field; prints and asserts the ≥ 80% @ ≥ 0.7 headline metric. |
| `lib/synth/__tests__/field.test.ts` | All 40 positions, alias matching, zone math, left-hander mirroring. |
| `lib/synth/__tests__/cricsheet-integration.test.ts` | Every delivery of the real bundled match through the parser without error. |
| `lib/synth/__tests__/stage2.test.ts` | The LLM fallback contract with a fake caller: disabled = untouched, hash cache = one call, garbage = rejected, budget respected, < 2 KB budget kept. |
| `lib/live/__tests__/` | Poller diffing, adaptive cadence, replay engine (replays the entire real match and asserts the rebuilt final state equals the known result: 170/4 & 172/4, "Australia won by 6 wickets"), an integration test driving the real SSE route, per-message size assertions, rate limiter. |
| `components/stadium/__tests__/` | Choreography scene shapes (see §5.7) and venue theming. |
| `lib/depth/__tests__/depth.test.ts` | Ratings, partnerships, coverage gate, H2H math against both the mock universe and the real match. |

---

## 6. How the code flows — five end-to-end walkthroughs

### Flow A — Opening the home page
1. Browser requests `/`. Next.js runs [app/(home)/page.tsx](app/(home)/page.tsx) **on the server**.
2. `getFixtures(todayKey)` → `cache()` → `getProvider()` → the active adapter returns `Fixture[]`.
3. The page picks live matches, features the first one, groups the rest by series, and streams back fully rendered HTML (SEO-ready, fast on 4G). Client JS only hydrates the small interactive bits (date strip scrolling, filter pill).

### Flow B — A ball is bowled in a real live match (memory mode)
1. Somewhere, Kohli flicks one through midwicket. ~10 s later the provider's feed updates.
2. The per-match ticker fires `syncMatch()`. The provider now returns 113 events; the store has `seen: 112` → 1 fresh event.
3. Stage 2 (if enabled) checks the new ball: Stage-1 confidence 0.87 → no LLM call needed.
4. Version bumps 41 → 42; state is stored; a `ball` delta (~1.3 KB: one event + slim header) is published.
5. The store fans it out; every SSE connection writes `event: ball\ndata: {...}`.
6. In each browser, `use-live-match` applies the delta (version check passes), appends the event, updates the header.
7. Three components react at once from the same store: the **feed** slides the new row in with a "4" chip and the context bar recomputes CRR/RRR; the **panel** queues a `PlayableBall` — `shotFor(event)` synthesizes `{shotType:'flick', wagonZone:3, trajectory:'ground', landingRadius:1, ...}`; the **stadium** plays the scene: run-up, swing, golden trail along the ground to deep midwicket, rope flash, score overlay ticks. The panel writes the playhead; the feed highlights that exact row.

### Flow C — Watching a replay
1. User opens `/match/1490706/live?replay=1490706&speed=16x`.
2. The live page renders the panel + feed with `streamPath = /api/live/1490706?replay=1490706&speed=16x` and no initial snapshot.
3. The SSE route sees `?replay=`, calls `acquireReplaySession("1490706", "16x")` — key `replay:1490706:16x`. First viewer: the session loads the match through the provider (Cricsheet fallback finds the bundled file), builds a zeroed innings state, and starts a 2.5 s tick timer (40 000 / 16).
4. Each tick evolves innings math (`applyEventToInnings`), rebuilds the header (`buildHeader` — including chase sentences in the second innings), and publishes one `ball` delta. The client experience is *identical* to a live match. A second tab at the same speed attaches to the same session — watch-together for free.
5. Timeline exhausted → a final `completed` status → clients show ENDED and close.

### Flow D — A low-confidence ball meets Stage 2
1. Provider text: *"tucked away neatly"*. Stage 1 finds no verb, no fielder → confidence 0.32 (< 0.5).
2. `enrichEvents` (inside `syncMatch`, server-side, fresh deltas only) checks the hash cache — miss — and spends one of 4 budget slots on a Haiku call with strict JSON schema.
3. The reply is zod-validated and reconciled against facts (2 runs → radius clamped ≤ 0.9, confidence clamped to ≤ 0.9). Result cached by text hash.
4. The delta goes out with `synth` attached (~250 B extra, still < 2 KB). Clients render the LLM's zone via `shotFor` — which prefers `event.synth`. Any failure anywhere: the event flows through untouched and the client's conservative Stage-1 shot renders instead. No key set? None of this runs.

### Flow E — Degradation ladder on a weak device
1. Live page loads. The panel checks: user's saved 2D/3D toggle → `prefers-reduced-motion` → `supportsWebGL()`.
2. Old Android WebView with no GL: the 3D chunk is **never fetched** (`next/dynamic` only loads on mount); the 2D SVG pitch map renders the same `PlayableBall` queue.
3. Reduced motion on: 2D map with instant/static position updates instead of tweens.
4. JS failed entirely? The page is server-rendered — score header, recent balls and scorecard are all still there. 3D → 2D → text, per CLAUDE.md §9.

---

## 7. Running the app locally

### Prerequisites
Node.js ≥ 18.18 (any recent LTS) and npm. Nothing else — no database, no Docker, no accounts.

### Zero-config start (mock data)
```bash
npm install
npm run dev
```
Open **http://localhost:3000**. You get the full app on the mock universe: a live IND v ENG T20I frozen mid-chase ("England need 98 off 52 balls"), completed and upcoming fixtures, full scorecards, lineups with ratings, stats, H2H, player pages, and the MLC points table under Series.

> Port taken? Next auto-increments to 3001 — check the terminal banner. Stale processes: `lsof -ti:3000 | xargs kill`.

### The flagship local demo — replay through the whole pipeline
```
http://localhost:3000/match/1490706/live?replay=1490706&speed=16x
```
A real Women's T20 World Cup match streams ball by ball through poller-store-SSE-client-synthesizer-3D — every layer of the system exercised with zero keys. Crank `speed=64` for a ball every ~0.6 s.

### Other providers
```bash
DATA_PROVIDER=cricsheet npm run dev    # real historical data (fixtures on 2026-06-28)
DATA_PROVIDER=cricketdata npm run dev  # real live data — needs CRICKETDATA_API_KEY in .env.local
```
Copy [.env.example](.env.example) to `.env.local` and fill only what you need. Every variable is documented inline there; the app boots fully with the file untouched.

### The automated gate — run before and after any change
```bash
npm run typecheck   # strict tsc, must be silent
npm test            # ~130 tests, must be green
npm run build       # production build — catches RSC/route issues dev mode won't
```

---

## 8. Testing every feature locally

A feature-by-feature manual test plan. (The per-phase deep checklists from the old README are consolidated here.)

**Home & navigation** — On `/`: live hero shows IND 189/7 (20) vs ENG 92/3 (11.2) with the chase line; date strip is sticky and swaps days; Live pill (`?live=1`) filters to live matches; MLC group renders below the hero. Resize to ~390 px → bottom tab bar appears. `/match/does-not-exist` and `/matches/2026-13-40` → the designed "Gone — over the ropes" 404, never a stack trace.

**Match tabs** — Click into the live match. Scorecard: batting + bowling tables foot (batter runs + extras = total). Info: toss, officials, venue. Lineups: rating badges on involved players (Kohli's 67 off 45 rates ≥ 8), tap a player → bottom sheet with their wagon wheel (Jacks has shots; a yet-to-bat player has none). H2H: IND 1–1 ENG, form pills newest-first. Stats on the mock match: worm/Manhattan honestly *withheld* (partial ball window — the note card explains); partnerships and wagon wheels render. For full charts: `DATA_PROVIDER=cricsheet npm run dev` → `/match/1490706/stats` — worm ends at 170 & 172, Manhattan bars sum to each innings total.

**Live pipeline** — Open the replay URL (§7). Expect: "Replay · 16x" chip, context bar starting IND 0/0, a ball sliding in per tick, CRR ticking. Wire protocol by hand:
```bash
curl -N "http://localhost:3000/api/live/1490706?replay=1490706&speed=64"
```
First frame `event: snapshot`, then `event: ball` frames each < 2 KB (or watch DevTools → Network → EventStream). **Fan-out:** two tabs on the same replay URL tick in lockstep. **Reconnect:** kill the dev server mid-replay, restart — the chip flips Reconnecting… → LIVE with a fresh snapshot, no manual reload. **Sync trigger:** `curl -s http://localhost:3000/api/sync` → JSON report; with `SYNC_SECRET` set, an unauthenticated call gets 401. **Rate limit:**
```bash
for i in {1..8}; do curl -sN --max-time 2 -o /dev/null -w "%{http_code} " \
  -H "x-forwarded-for: 198.51.100.9" \
  "http://localhost:3000/api/live/eng-in-ind-2026-t20i-3" & done; wait; echo
```
→ six `200`s, two `429`s.

**Shot Synthesizer** — `npm test -- lib/synth` prints the headline metric (`corpus: 1056 lines · ≥0.7 confidence: 95.6% — target ≥80%`). Both CLAUDE.md reference deliveries (the Rashid-to-Axar cut to sweeper cover; the googly stumping) are asserted field-by-field in the suite. Visually: during a replay a FOUR races along the ground to the rope, a SIX lofts, a vague line gets a modest generic animation — never a spectacular scene for a dot ball.

**3D stadium** — DevTools → Network, filter JS, load a live page: three.js chunks appear only when the canvas mounts (initial JS stays ~106 kB; lazy 3D ≈ 234 kB gz; downloaded 3D *assets* = 0 bytes). Watch each outcome type in a replay: dot, single, FOUR (ground + rope flash), SIX (confetti + crowd flash at the landing stand), bowled (stumps explode), stumped (advance-miss-stump), caught (gather at the zone). Cycle TV/Bat/Bird/Free — four genuinely different angles. Toggle 2D/3D — the playhead never desyncs. OS reduced-motion on, or WebGL disabled → 2D map mounts instead and the 3D chunk is never fetched. Performance: DevTools CPU throttle 4–6× during a scene, watch for dropped frames.

**PWA & alerts** — `npm run build && npm start` (SW registers in production only). Install from the address bar; DevTools → Network → Offline → reload → the "Rain delay" shell, never a browser error page. Alerts: open a replay, click Alerts, grant permission — wicket/boundary notifications fire for **arriving** balls only (never the snapshot backlog).

**Stage 2** — `npm test -- lib/synth/__tests__/stage2` proves the whole contract keyless. With a real `ANTHROPIC_API_KEY`, low-confidence balls in live deltas arrive with `synth` attached (visible in EventStream frames); unset it — everything still renders via Stage 1.

**Budgets** — `npx lighthouse http://localhost:3000 --view` → ≥ 90 perf / ≥ 95 a11y (mobile), per CLAUDE.md §8.

---

## 9. The features, explained as a product

- **Match Day home** — FotMob's information architecture: sticky date strip, live hero card, series-grouped fixtures with status chips and honest context lines ("ENG need 98 off 52"), a Live filter.
- **Live tab (the USP)** — the collapsible Reconstruction panel (3D stadium or 2D pitch map) with the event pill, camera presets and skip chip; below it the over-grouped commentary feed; anchored by the context bar (score, CRR/RRR, last-ball anchor). Honestly labeled "Live Reconstruction" — trust is a feature.
- **Replay ("Watch replay")** — any finished match with ball data replays through the live pipeline at 1–64×; same-speed viewers watch together.
- **Scorecard / Info** — Cricbuzz-parity tables that always foot, toss/officials/venue.
- **Lineups + ratings** — both XIs on a field graphic with live 0–10 ratings and per-player synthesized wagon wheels (a feature Cricbuzz doesn't have).
- **Stats** — worm, Manhattan, partnerships, per-batter wheels, per-bowler line/length maps — server-rendered SVG, withheld rather than wrong when ball coverage is partial.
- **H2H** — rivalry record, last-5 form, meetings, at-this-venue.
- **Player profiles** — server-rendered career tables, linked from every scorecard name.
- **PWA + alerts** — installable, offline shell, local wicket/boundary notifications.
- **Honesty & legal posture** — reconstructions labeled as such; venue-local times; latency anchor instead of a fake LIVE dot; Cricsheet attributed (ODC-BY); no scraped data, no player photos, no betting content, no login.

---

## 10. How to add a new feature — recipes

General rule from CLAUDE.md: **ask before changing the domain types or the provider interface; everything else, use your judgment.** And the workflow is always the same: make the change → `npm run typecheck && npm test && npm run build` → walk the relevant §8 checklist.

### Recipe 1 — Add a new data provider (e.g. implement EntitySport)
1. Create `lib/providers/entitysport.schema.ts`: zod schemas for every endpoint response you consume. Never trust provider JSON.
2. Flesh out [entitysport.adapter.ts](lib/providers/entitysport.adapter.ts) following the cricketdata adapter's shape: a private `call()` with TTL caching, then map each endpoint → canonical types. Use the helpers in `util.ts`. Throw the typed errors from `errors.ts` (`MatchNotFoundError` for unknown ids — that's what triggers the designed 404 and the Cricsheet fallback).
3. Record real responses into `lib/providers/__fixtures__/entitysport/` and write an adapter test like `cricketdata.adapter.test.ts` (inject `fetchImpl`, never hit the network in tests).
4. Add the adapter to `provider.contract.test.ts` so the cross-adapter invariants (scorecards foot, etc.) cover it.
5. It's already wired in the registry — set `DATA_PROVIDER=entitysport` + the token and every screen just works. **That's the payoff of the adapter pattern: zero UI changes.**

### Recipe 2 — Teach the synthesizer new vocabulary
Say commentary uses "uppercuts" and it parses generically:
1. Add the phrases to the right group in [lexicon.ts](lib/synth/lexicon.ts) (uppercut is a cut variant that flies — mind the group *order*, and remember normalization strips hyphens).
2. Add 2–3 real commentary lines to the corpus in `lib/synth/__tests__/` asserting shot/zone/confidence.
3. `npm test -- lib/synth` — the ≥ 80% @ ≥ 0.7 gate must stay green. If you touched `WEIGHT` in synthesize.ts, watch the headline metric closely; those numbers are tuned.

### Recipe 3 — Add a new match tab (e.g. "News")
1. Create `app/match/[matchId]/news/page.tsx` — fetch via `lib/data.ts` getters (add one if needed, `cache()`-wrapped), render server-side.
2. Add the tab to [tab-bar.tsx](components/match/tab-bar.tsx). The layout already shares the score header — no refetch on switch.
3. Add a loading state and make sure an empty/failed state is *designed*, per the house rule: no blank pages, no raw errors.

### Recipe 4 — Add a venue theme
Add a `["substring", {…}]` entry to `KNOWN` in [venue-theme.ts](components/stadium/venue-theme.ts) (keys match against lowercase "name city"): boundary semi-axes `rx`/`rz` in meters, `lighting`, stand/roof/crowd colors, optional landmarks. Add a case to `components/stadium/__tests__/venue-theme.test.ts`. Unknown venues already get a deterministic hash skin, so this is polish, not correctness.

### Recipe 5 — Add a stat chart
1. Build the series in [lib/depth/stats.ts](lib/depth/stats.ts) as a pure function; unit-test it in `depth.test.ts` (assert totals foot against the scorecard).
2. Render it as a server SVG component in `components/charts/` (copy an existing chart's approach: semantic colors from `outcomeColor`, `<title>` tooltips, legends).
3. If it needs full ball data, gate it behind `inningsBallCoverage` — withheld beats wrong.
4. Wire into `app/match/[matchId]/stats/page.tsx`.

### Recipe 6 — Extend the wire protocol (rare — think twice)
Add the message type to `lib/live/types.ts`, publish it in the poller, handle it in `use-live-match.ts` — and keep it under the 2 KB budget the tests assert. Versioning must stay monotonic; anything the client can't parse must be ignorable.

---

## 11. Going to production — the complete playbook

Goal: a public URL any cricket fan can open — like Cricbuzz — showing **real matches happening in the world right now**. Everything below is incremental; the app is designed so each step is small.

### 11.1 The moving parts you need

| Concern | Choice | Cost |
|---|---|---|
| Live data | cricketdata.org paid tier to start; **EntitySport licensed** for real production (their T&Cs and per-ball latency are built for this) | free-tier → ~$70+/mo depending on plan |
| Hosting | **Path A:** one always-on Node server (Railway / Fly.io / a VPS). **Path B:** Vercel + Upstash Redis | ~$5–10/mo (A) / free-ish then usage (B) |
| Live state | in-process (A) or Upstash Redis (B) | Upstash free tier goes far |
| Poll trigger | built-in tickers (A) or QStash/cron → `/api/sync` (B) | pennies |
| Stage-2 LLM | Anthropic API key (optional) | pennies per match, hard-capped by design |
| Domain + TLS | any registrar; the host terminates TLS | ~$10/yr |
| Analytics | Plausible or PostHog EU (privacy-friendly, no cookie banner) | free tier |

### 11.2 Path A — single always-on server (recommended first deploy)

The architecture the memory store was built for, and the cheapest thing that is *correct*. SSE keeps long-lived connections; an always-on Node process handles that natively, and the refcounted tickers mean you poll the provider **only while somebody is actually watching**.

1. Get a `CRICKETDATA_API_KEY` (paid tier for real traffic — 100 req/day does not survive a match day; the poller alone is ~900 requests per live match).
2. Deploy to Railway/Fly: build `npm run build`, run `npm start`, one instance, ~512 MB is plenty.
3. Environment:
   ```
   DATA_PROVIDER=cricketdata
   CRICKETDATA_API_KEY=...
   SYNC_SECRET=<long random string>
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   ANTHROPIC_API_KEY=...        # optional, Stage 2
   ```
4. Point your domain at the instance; verify `curl -N https://yourdomain.com/api/live/<liveMatchId>` streams a snapshot.
5. Optionally hit `/api/sync?secret=...` from a 1-minute cron to pre-warm state before viewers arrive.

**Limits of Path A:** one instance = one process = memory state; a redeploy drops SSE connections (clients auto-reconnect and heal via snapshot — by design); vertical scaling only. That's fine well into thousands of concurrent viewers — SSE connections are cheap.

### 11.3 Path B — Vercel + Upstash (serverless/global)

Serverless functions can't hold state or run timers, so the pieces rearrange — the code already supports all of it:

1. Create an Upstash Redis database; set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel. The store auto-switches; SSE instances deliver deltas via the 2 s version poll.
2. **Something must call `/api/sync` every ~4 s during live play** (Vercel Cron floors at 1/min): use Upstash QStash self-chaining (sync response schedules the next call in 4 s), or keep a $5 worker that just curls the endpoint — the pragmatic hybrid.
3. Set `SYNC_SECRET` and give it to QStash/the worker.
4. Mind function duration limits for the SSE route (long-running responses need Pro-tier limits or the route on a small always-on box even if pages live on Vercel).

**Rule of thumb:** Path A is simpler and cheaper until you need multi-region or very high concurrency. The codebase treats both as first-class — the store abstraction *is* the migration path (set two env vars, add a writer).

### 11.4 Getting real live world data flowing

1. **Sanity-check the adapter against today's real matches** locally first: `DATA_PROVIDER=cricketdata npm run dev`, open the home page, click into a real live match, watch the feed tick. Real providers send garbage mid-match — the zod schemas will tell you *exactly* what changed if something breaks (`ProviderResponseError` with issue details in logs).
2. **Know your latency honestly.** cricketdata free/cheap tiers run ~30–60 s behind broadcast. The UI is already honest about it (the "Last ball" anchor) — do not add a fake LIVE dot to compensate.
3. **Budget requests.** Poller cost ≈ (2 requests per sync) × (match minutes ÷ poll interval). Two simultaneous live matches at 4 s cadence ≈ 7k requests/day. Pick the API plan accordingly; the adaptive cadence and view-refcounted tickers are your cost controls.
4. **When you license EntitySport**, implement Recipe 1. The rest of the app doesn't change.
5. **Ball-by-ball depth varies by provider/plan.** The stats tab already degrades honestly (coverage gate); the synthesizer already degrades honestly (confidence). Nothing lies when data is thin.

### 11.5 Production hardening checklist

- [ ] `SYNC_SECRET` set; `/api/sync` returns 401 without it.
- [ ] Rate limiting verified from a public IP (the `x-forwarded-for` path — make sure your proxy sets it).
- [ ] If multi-instance: move the rate limiter to Redis (noted in `rate-limit.ts`).
- [ ] Error tracking (e.g. Sentry) on server + client; watch for `ProviderResponseError` spikes — that's the provider changing their payload mid-season.
- [ ] Logs/alerts on `/api/sync` failures (in Path B this is your heartbeat).
- [ ] Lighthouse on the production URL: ≥ 90 perf / ≥ 95 a11y mobile (CLAUDE.md §8 budgets).
- [ ] PWA verified over HTTPS (SW only registers in production; offline shell works).
- [ ] Cricsheet attribution visible in the footer; no scraped data anywhere (CLAUDE.md §12 — provider ToS are contracts).
- [ ] Analytics wired (Plausible/PostHog EU — no cookie banner needed).
- [ ] A staging environment that runs `DATA_PROVIDER=mock` so you can smoke-test deploys on a quiet day.

### 11.6 Scaling story (when you're lucky enough to need it)

The fan-out math is the whole point: viewers cost you SSE connections (cheap), **not** provider requests (expensive, fixed at one poll per match). India v Pakistan with 100k concurrent viewers is still ~15 provider requests per minute. Scale reads by adding SSE capacity (more instances + Upstash mode, or a dedicated SSE tier), keep exactly one writer per match, and let the CDN cache the server-rendered pages for non-live content. Push notifications (VAPID web push for wickets in followed matches) are the designed next step on top of the existing alerts store.

---

## 12. Glossary for newcomers

| Term | Meaning here |
|---|---|
| **RSC / Server Component** | React components that run only on the server; they can fetch data directly and ship HTML, not JS. Everything in `app/` is one unless marked `"use client"`. |
| **SSE (Server-Sent Events)** | A long-lived HTTP response the server keeps writing `event:`/`data:` frames into. The browser's `EventSource` API consumes it and reconnects automatically. Our whole live experience is one SSE stream per match. |
| **Adapter pattern** | One interface (`CricketDataProvider`), many implementations. The app depends on the interface; swapping data sources is an env var. |
| **Snapshot / delta** | Full state once on connect; tiny increments afterwards. The versioned combination is what makes reconnects self-healing. |
| **Fan-out** | One upstream poll distributed to N subscribers. The inverse of N clients hammering the API. |
| **zod** | Runtime schema validation. TypeScript types vanish at runtime; zod is how we refuse garbage at the boundary. |
| **zustand** | A minimal React state store. We use the vanilla flavor + a registry so one store per stream is shared across components. |
| **Refcounting** | Counting attach/detach so a shared resource (poll ticker, EventSource, replay session) starts with the first user and stops with the last. |
| **Wagon wheel / zones** | Cricket's 8-sector shot map around the batter. Zone 1 = fine leg for a right-hander; see `field.ts` for the geometry. |
| **Line & length** | Where a delivery pitches: line = off/middle/leg axis, length = yorker→bouncer axis. |
| **Legal ball** | A delivery that counts toward the over (wides/no-balls don't). All overs math runs on `legalBalls`, never display strings. |
| **CRR / RRR** | Current and required run rate — runs per over scored / needed. |
| **Cricsheet** | cricsheet.org — open-licensed (ODC-BY) historical ball-by-ball data. Our dev fuel and replay library. |
| **PWA / service worker** | Installable web app + the background script (`sw.js`) that makes the offline shell work. |
| **`prefers-reduced-motion`** | An OS accessibility setting; when on, we swap animations for static updates everywhere, including dropping to the 2D view. |

---

*Optimize for: speed → clarity → immersion → everything else. When in doubt, the spec is [CLAUDE.md](./CLAUDE.md); the gate is `npm run typecheck && npm test && npm run build`; and the demo that proves the whole machine is `/match/1490706/live?replay=1490706&speed=16x`.*
