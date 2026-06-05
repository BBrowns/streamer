# Streamer — Architecture & Engineering Reference

> **Audience:** Engineers (human or AI agent) who need to understand, extend, or debug this system.
> This document is the canonical technical reference. Keep it up-to-date whenever the architecture changes.
> For the current playback, bridge, download, casting, and UI roadmap, see [AGENT_HANDOFF.md](./AGENT_HANDOFF.md).

---

## 1. Why This Exists

Stremio is an excellent concept — a media player that delegates content discovery and streaming entirely to third-party "add-ons" via a well-defined JSON manifest API. However, Stremio itself is a closed, desktop-only binary. **Streamer** reimplements the same add-on protocol from scratch as an open-source, cross-platform system:

- A **mobile-first** UI (iOS/Android/Web) built on Expo/React Native.
- A **self-hosted API server** that aggregates content from any standard Stremio add-on URL.
- A **local P2P daemon** (WebTorrent) that bridges torrent magnet links into HTTP streams playable on any device — including iOS, which cannot handle raw magnets.
- An optional **Electron desktop shell** wrapping the web app.

The core value proposition: you own your data, you choose your add-ons, and you can stream on any device.

---

## 2. Repository Layout (Turborepo Monorepo)

```
streamer/
├── apps/
│   ├── mobile/          # Expo SDK 55 — iOS, Android, Web
│   └── desktop/         # Electron shell (wraps the web build of apps/mobile)
├── packages/
│   ├── shared/          # TypeScript types + Zod schemas shared by server & mobile
│   └── stream-server/   # Local P2P daemon (WebTorrent + Chromecast bridge)
├── server/              # Hono API server (Node.js) + Prisma ORM
├── turbo.json           # Task graph: build → test → typecheck → lint
└── package.json         # Workspaces root + toolchain (Prettier, Husky, patch-package)
```

**Build system:** [Turborepo](https://turbo.build/) orchestrates all tasks. It caches outputs and understands the dependency graph (`^build` means "build dependencies first"). This means `turbo run build` always builds `packages/shared` before `server` or `mobile`.

**Package manager:** npm workspaces, pinned to npm ≥ 10.9. The `overrides` block in the root `package.json` enforces unified versions of `react`, `react-dom`, and `zod` across all workspaces to avoid duplicate installs.

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                           │
│                                                             │
│  ┌──────────────────────────┐   ┌──────────────────────┐   │
│  │  apps/mobile             │   │  apps/desktop        │   │
│  │  (Expo / React Native)   │   │  (Electron + web)    │   │
│  │  iOS · Android · Web     │   │                      │   │
│  └──────────┬───────────────┘   └──────────────────────┘   │
└─────────────┼───────────────────────────────────────────────┘
              │ REST/JSON (JWT Bearer)
              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER LAYER  (:3001)                     │
│                                                             │
│  Hono (edge-ready Node.js HTTP framework)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  /auth   │ │ /addons  │ │ /library │ │ /api/catalog │  │
│  │  /trakt  │ │ /sessions│ │ /sync    │ │ /api/meta    │  │
│  │ /notifs  │ │          │ │          │ │ /api/stream  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│                                                             │
│  Prisma ORM ──► PostgreSQL (prod) / SQLite (dev)           │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS fan-out (parallel)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  ADD-ON ECOSYSTEM (external)                 │
│                                                             │
│   Cinemeta · Torrentio · any Stremio-compatible manifest    │
│   (catalog, meta, stream endpoints — pure JSON over HTTPS)  │
└─────────────────────────────────────────────────────────────┘
                             │ magnet / HLS URL
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              STREAM-SERVER DAEMON  (:11470)                  │
│                                                             │
│  Express · WebTorrent · Chromecast (bonjour + castv2)       │
│  Converts magnet links → HTTP byte-range stream             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. The Server (`server/`)

### 4.1 Framework & Entry Point

- **Framework:** [Hono](https://hono.dev/) — a tiny, edge-compatible web framework similar to Express but built around the Fetch API. It runs on Node.js via `@hono/node-server`.
- **Entry:** `src/index.ts` connects Prisma, starts Trakt background sync, then calls `createApp()` and hands it to Hono's Node adapter.
- **App factory:** `src/app.ts` — middleware is registered globally (CORS, `secureHeaders`, `requestId`, rate limiters, Pino logger), then each domain module's router is mounted.

### 4.2 Module Structure (Domain-Driven)

Each business domain lives in `src/modules/<domain>/` and follows a ports-and-adapters pattern:

| Module         | Responsibility                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `auth`         | JWT access + refresh token issuance, bcrypt password hashing, email verification, password reset via Nodemailer |
| `addon`        | Install/uninstall Stremio add-ons; validates manifest via Zod before persisting                                 |
| `aggregator`   | Fan-out catalog/meta/stream requests to all of a user's add-ons; enriches and sorts streams                     |
| `library`      | Persist watched items per user (add/remove from library, watch progress)                                        |
| `trakt`        | OAuth integration with Trakt.tv — sync watch history bidirectionally                                            |
| `sync`         | SSE (Server-Sent Events) endpoint for real-time client sync                                                     |
| `sessions`     | Active device session tracking (device ID, IP, last activity)                                                   |
| `notification` | In-app notification store — download completion, system alerts                                                  |
| `debrid`       | Real-Debrid resolver — upgrades torrent magnets to a fast direct HTTP link                                      |
| `feature-flag` | Simple in-memory feature flags (e.g., enabling/disabling Real-Debrid)                                           |

### 4.3 The Aggregator — Core Logic

The `AggregatorService` is the most architecturally significant part of the server. It is a **fan-out aggregator** over external add-on APIs.

**How it works:**

1. Look up all `InstalledAddon` records for the requesting user from Postgres.
2. Filter to add-ons that declare support for the requested resource (`catalog`, `meta`, or `stream`) and content type (`movie`, `series`) using the manifest's `resources` and `types` arrays.
3. Issue all HTTP requests **in parallel** via `Promise.allSettled` — individual add-on failures never crash the aggregate response.
4. Merge results; for streams, pass each through `StreamParser.enrich()` (regex-extracts resolution and seeder count from the title string) then sort by resolution → seeders descending.

**Resilience stack (per add-on, via [Cockatiel](https://github.com/connor4312/cockatiel)):**

Policies are composed in this order (outermost → innermost):

```
bulkhead → timeout → retry (1×, exponential backoff) → circuit breaker
```

| Policy          | Setting                                                  | Rationale                                                                  |
| --------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Bulkhead        | Max concurrent requests per add-on                       | Prevents a single slow add-on from exhausting the server's connection pool |
| Timeout         | 5 s (aggressive — immediately cancels the request)       | Add-ons can be flaky; we'd rather return partial results fast              |
| Retry           | 1 attempt, 500ms–2s backoff                              | Handles transient network blips without hammering the add-on               |
| Circuit Breaker | Opens after 3 consecutive failures, half-open after 15 s | Stops wasting time on a dead add-on; auto-recovers                         |

A `policyCache` map (keyed by `addonId`) preserves circuit breaker state across requests so the breaker actually tracks cumulative failures — not just per-request state.

**SSRF protection:** Add-on manifest, catalog, meta, and stream requests are
validated before every outbound fetch. The validator blocks credentials,
non-HTTPS URLs by default, localhost, link-local, private, carrier-grade NAT,
benchmark, documentation, multicast, and other reserved IP ranges across IPv4,
IPv6, and IPv4-mapped IPv6. Redirects are followed manually and each redirect
target is validated before the next request. Local/private add-ons require the
explicit `ADDON_ALLOW_PRIVATE_NETWORKS=true` opt-in for development or tests.

### 4.4 Authentication

- **Access tokens:** Short-lived JWT (HS256, default 15 min), signed with `JWT_SECRET`.
- **Refresh tokens:** Long-lived (default 7 days), stored hashed in the `refresh_tokens` table. On use, the old token is deleted and a new one issued (rotation).
- **Rate limiting:** `express-rate-limit` middleware with separate limits for auth endpoints (stricter) vs. catalog endpoints (more permissive). In `NODE_ENV=test`, rate limiting is bypassed entirely to avoid test flakiness.
- **Email verification:** Required on registration. Tokens stored in `email_verification_tokens` with an `expiresAt` timestamp. Emails sent via Nodemailer.
- **Device sessions:** Every login records an `ActiveSession` keyed on `(userId, deviceId)`. The client sends `X-Device-Id` header; the server upserts the session on each authenticated request.

### 4.5 Database

- **ORM:** Prisma 6
- **Production database:** PostgreSQL (connection via `DATABASE_URL`)
- **Development:** Any PostgreSQL instance (Docker recommended). The README mentions SQLite as a historic default; the schema is now PostgreSQL-only.
- **Testing:** Uses `@testcontainers/postgresql` to spin up ephemeral Postgres containers for integration tests — guaranteeing full isolation with no shared state between test runs.

**Key models:**

| Model                    | Purpose                                                        |
| ------------------------ | -------------------------------------------------------------- |
| `User`                   | Core user identity                                             |
| `RefreshToken`           | Hashed refresh tokens with expiry                              |
| `EmailVerificationToken` | Single-use email verification links                            |
| `PasswordResetToken`     | Single-use password reset links                                |
| `ActiveSession`          | Per-device session tracking                                    |
| `InstalledAddon`         | User → add-on mapping; manifest stored as JSON blob            |
| `LibraryItem`            | User's saved movies/series                                     |
| `WatchProgress`          | Per-user, per-item playback position (supports season/episode) |
| `TraktToken`             | Trakt.tv OAuth access + refresh tokens per user                |
| `TraktSyncQueue`         | Outbound Trakt scrobbles queued for retry on failure           |
| `Notification`           | In-app notifications                                           |

### 4.6 Real-Debrid Integration

When the `real-debrid` feature flag is enabled, the `resolveStream` method in the aggregator delegates to `RealDebridResolver`. It converts a torrent `infoHash` to a fast, uncached direct HTTP link via the Real-Debrid API. If Real-Debrid fails or is disabled, the fallback is a raw `magnet:?xt=urn:btih:<infoHash>` URI, which the stream-server daemon then handles locally.

A bulk-resolve endpoint (`POST /api/resolve-streams-bulk`) eliminates N+1 resolution calls from the detail screen when many streams are visible simultaneously.

---

## 5. The Stream-Server Daemon (`packages/stream-server/`)

This is a **separate Node.js process** running on `:11470`. Its sole job is to bridge the gap between the BitTorrent protocol and HTTP — crucially, this makes torrent streams playable on iOS (which has no native BitTorrent stack).

**How torrent playback works now:**

1. The mobile client asks the server playback planner for a `PlaybackPlan`.
2. If a torrent source is selected and the bridge is available, the mobile `TorrentEngine` creates a gateway job with `POST /api/gateway/jobs`.
3. The stream-server starts WebTorrent peer discovery and metadata warmup, exposing job `phase`, `progress`, `peerCount`, elapsed time, and timeout metadata through `GET /api/gateway/jobs/:id`.
4. The mobile player maps gateway phases into typed runtime states such as `creating_gateway_job`, `finding_peers`, and `preparing_metadata`.
5. Once ready, the player receives a signed
   `/api/gateway/jobs/:id/stream?expires=...&signature=...` URL. The URL is
   header-free for `expo-video` and cast devices, but the bridge validates the
   HMAC signature and expiry before serving bytes. Direct-file responses
   support single HTTP byte ranges, including open-ended and suffix ranges, so
   `expo-video` can seek without receiving incorrect byte windows. Expired
   URLs are accepted only when they match the same signature already used by
   the active stream and stay inside a short grace window, avoiding broken
   ongoing range requests mid-playback.
6. If the player stops, the mobile engine calls `DELETE /api/gateway/jobs/:id`
   so warmup work is cancelled instead of leaking. The bridge also prunes
   unused ready jobs on a timer while protecting jobs with active stream
   consumers.

The legacy `/stream?magnet=<encoded>&fileIndex=0` endpoint still exists for compatibility, but new torrent playback should prefer gateway jobs because they provide readiness state, cancellation, progress, and future remux/transcode hooks.

FFmpeg remux output is currently a sequential chunked MP4 response. It does not
support byte-range seeking; production-grade seek for remuxed sources requires
a packaged or persistent remux output rather than byte offsets into the source
container.

**Chromecast:** The `castv2-client` library (running inside the daemon) communicates directly with Chromecast devices discovered via `bonjour-service` (mDNS). The `/api/cast` router handles device discovery and playback control. This avoids requiring the mobile client to implement the Chromecast protocol natively.

**Metrics:** `/api/torrent/:infoHash/metrics` exposes download speed, peer count, and buffer health for the stream currently being served. Gateway jobs expose coarser preparation progress before the media URL is ready.

**Bridge auth:** Control routes use `requireBridgeAuth` when `STREAMER_BRIDGE_TOKEN` is configured. Clients can send either bearer auth or `x-streamer-bridge-token`. Gateway stream URLs stay header-free for native video/cast consumption, but are HMAC-signed with expiry query params before the bridge serves bytes.

> **Critical:** The stream-server must be running locally on the same machine as the client (or reachable on the local network) for torrent playback to work. It is not a cloud service.

---

## 6. The Mobile App (`apps/mobile/`)

### 6.1 Tech Stack

| Concern          | Solution                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| Framework        | Expo SDK 55 / React Native 0.83                                                  |
| Routing          | Expo Router (file-based, similar to Next.js App Router)                          |
| Data fetching    | TanStack Query (React Query) v5                                                  |
| State management | Zustand v5 (multiple atomic stores)                                              |
| Styling          | NativeWind v4 (Tailwind for React Native) + inline StyleSheet for dynamic styles |
| Video player     | `expo-video` (`useVideoPlayer` hook + `VideoView` component)                     |
| I18n             | i18next + react-i18next (locale files in `locales/`)                             |
| Error tracking   | Sentry (`@sentry/react-native`)                                                  |
| Auth storage     | `expo-secure-store` (keychain-backed, not AsyncStorage)                          |
| Biometrics       | `expo-local-authentication`                                                      |
| E2E testing      | Detox (iOS simulator)                                                            |
| Unit testing     | Jest + `jest-expo` + `@testing-library/react-native`                             |

### 6.2 App Routing (File-Based)

```
app/
├── _layout.tsx              # Root layout — auth gate, React Query provider, Sentry
├── login.tsx
├── register.tsx
├── forgot-password.tsx
├── reset-password.tsx
├── verify-email.tsx
├── onboarding.tsx
├── onboarding/setup.tsx
├── addons/index.tsx         # Add-on registry management
├── player.tsx               # Full-screen video player
├── detail/[type]/[id].tsx   # Content detail (movie or series)
├── search/results.tsx
├── notifications.tsx
├── privacy.tsx
├── terms.tsx
└── (tabs)/
    ├── _layout.tsx          # Bottom tab navigator
    ├── index.tsx            # Home — catalog grid
    ├── discover.tsx         # Trending / curated discover
    ├── library.tsx          # User's saved library
    ├── downloads.tsx        # Offline downloads management
    └── settings.tsx         # App settings, profile, Trakt OAuth
```

### 6.3 Stream Engine (Strategy Pattern)

The most architecturally interesting part of the mobile app is `services/streamEngine/`. It implements the **Strategy Pattern** to abstract over fundamentally different stream delivery mechanisms:

```
StreamEngineManager
├── resolveEngine(stream) → IStreamEngine
│
├── HLSEngine        — For .m3u8 HLS streams (direct URL to expo-video)
├── MP4Engine        — For direct .mp4 / HTTP progressive streams
├── TorrentEngine    — For infoHash/magnet streams → optional Debrid resolve,
│                      then local gateway jobs on the stream-server bridge
└── Real-Debrid path — Optional paid resolver, disabled by default
```

`IStreamEngine` defines the interface:

- `getPlaybackUri(stream)` → `Promise<string | null>`
- audio/subtitle track enumeration
- stream statistics (speed, peers)
- gateway job progress events (`creating_gateway_job`, `finding_peers`, `preparing_metadata`, `ready`, `cancelled`)

The player (`app/player.tsx`) calls `streamEngineManager.resolveEngine(currentStream)` and gets back the appropriate engine. This means adding a new stream type only requires implementing `IStreamEngine` and registering it — the player is oblivious to the delivery mechanism.

**FFmpeg remuxing:** On desktop (Electron) and when receiving MKV container torrents, the stream-server can pipe the torrent stream through an FFmpeg process to produce fragmented MP4 (`fMP4`) on the fly. This is necessary because iOS's `AVPlayer` (underlying `expo-video`) does not support MKV containers natively.

### 6.4 Playback Planning And Runtime State

Playback is no longer a direct "user picks source, source resolves immediately" flow. The current architecture is:

```
Detail Play Best
  → PlaybackOrchestrator.playBest()
  → POST /api/playback/plan
  → resolve selected source only when needed
  → playerStore.setStream(primary, mediaInfo, fallbackStreams)
  → player runtime state/error handling
```

Important client modules:

| Module                                        | Responsibility                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `services/playback/PlaybackPlanService.ts`    | Calls and validates `/api/playback/plan`, includes device profile and bridge diagnostics, resolves planned streams. |
| `services/playback/PlaybackOrchestrator.ts`   | Central Play Best entry point; returns a prepared stream or typed runtime error.                                    |
| `services/playback/PlaybackErrors.ts`         | Maps planner, resolver, bridge, peer, timeout, and codec failures into typed errors.                                |
| `services/playback/PlaybackSessionReducer.ts` | Creates persistence-safe sessions and applies typed append-only lifecycle events.                                   |
| `stores/playbackSessionStore.ts`              | Persists validated control-plane sessions while keeping raw planner candidates in memory only.                      |
| `stores/playerStore.ts`                       | Holds `runtimeState`, `runtimeError`, fallback queue, stream metrics, and playback state.                           |
| `components/player/PlayerStatusOverlay.tsx`   | Displays typed readiness/error states instead of an endless generic buffering state.                                |

Manual source selection still exists as an advanced fallback, but the product direction is to keep `Play Best` as the default user flow.

Planner v2 exposes deterministic ordered candidates, top-level selection and
fallbacks, typed rejection reasons, requested-action eligibility, compatibility
details, and timeout budgets. Candidate IDs are opaque UUIDs. The nested
`plan` object is a temporary compatibility wrapper for the current resolver;
new orchestration code should use the top-level fields.

`@streamer/shared` also defines the persistence-safe `PlaybackSession` control
plane contract. A session records action, opaque candidate snapshots, attempts,
gateway progress, typed errors, and an append-only event log. It never persists
`Stream` objects, resolved media URLs, magnets, info hashes, external URLs, or
bridge URLs.

The mobile `playbackSessionStore` persists only validated `PlaybackSession`
records. Its session candidate IDs are newly generated UUIDs rather than
planner candidate IDs. A module-local runtime map connects those IDs to
`PlannedMediaCandidate` values for the current app process; after restart the
missing mapping intentionally requires a new plan.

The existing planner/orchestrator/player flow remains backwards compatible
while later work moves Play, Download, and Cast onto the shared session model.
See [PLAYBACK.md](./PLAYBACK.md) for the contract rules and migration sequence.

### 6.5 Download Service

`services/DownloadService.ts` implements resumable offline downloads across three platform surfaces:

| Platform       | Mechanism                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS/Android    | `expo-file-system` `DownloadResumable` — supports true pause/resume via server-side byte-range headers. Resume data is persisted to `downloadStore` (Zustand + AsyncStorage) so downloads survive app restarts. |
| Web (Electron) | `window.desktopBridge.downloadMedia()` — calls into Electron's main process to perform the download natively in Node.js, with progress events bridged back via IPC.                                             |
| Web (browser)  | Anchor element click — no progress tracking; immediately marked complete.                                                                                                                                       |

**HLS downloads are explicitly blocked** with a user-facing `Alert`: HLS is an adaptive streaming format split into many `.ts` segment files and is not meaningfully downloadable to a single file using this approach.

After completion, the service fires a `POST /api/notifications` to create a server-side notification, which can then sync to other devices.

### 6.6 Key Zustand Stores

| Store                  | Contents                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `authStore`            | `isAuthenticated`, `user`, JWT token, bridge URL/token, theme preference; hydrates from secure storage |
| `playbackSessionStore` | Persistence-safe playback control sessions plus transient planner-candidate lookup helpers             |
| `playerStore`          | `currentStream`, `mediaInfo`, fallback queue, `runtimeState`, `runtimeError`, stream state, metrics    |
| `downloadStore`        | `tasks` map (id → progress/status/localUri/resumeData); persisted to AsyncStorage                      |

### 6.7 Trakt Scrobbling

The `useTraktScrobbler` hook in the player automatically reports watch events to Trakt.tv:

- **Start scrobble** when playback begins
- **Pause scrobble** when playback pauses
- **Stop scrobble** when 80%+ of content is watched (marks as "watched" on Trakt)

The server maintains a `TraktSyncQueue` for failed scrobble attempts and retries them via a background scheduler (`traktService.startBackgroundSync()`).

### 6.8 Chromecast

- **iOS/Android:** Uses `react-native-google-cast` (Google Cast SDK native module).
- **Desktop/Web:** The stream-server daemon's Bonjour discovery + `castv2-client` is used. The Electron bridge exposes cast device control to the web client. A `DesktopCastModal` component handles device selection and playback control.

---

## 7. The Shared Package (`packages/shared/`)

Contains all types and validation schemas used by **both** the server and the mobile client. This is the contract layer.

```
shared/src/
├── types/
│   ├── manifest.ts     # AddonManifest, catalog/resource/extra definitions
│   ├── meta.ts         # MetaPreview, MetaDetail, Video (episode metadata)
│   ├── stream.ts       # Stream (url, infoHash, title, resolution, seeders…)
│   ├── playback.ts     # Playback plans, device profiles, bridge hints, runtime states/errors
│   ├── auth.ts         # LoginRequest, RegisterRequest, TokenResponse…
│   ├── library.ts      # LibraryItem, WatchProgress
│   └── feature-flag.ts # FeatureFlag map
└── schemas/
    ├── manifest.schema.ts   # addonManifestSchema (Zod)
    ├── meta.schema.ts
    ├── stream.schema.ts
    ├── auth.schema.ts
    └── library.schema.ts
```

**Why this matters:** The server uses Zod schemas at runtime (to validate inbound add-on manifests and API request bodies via `@hono/zod-validator`). The mobile app imports the same TypeScript types for full end-to-end type safety. Changes to a shared type cause compile errors in both workspaces simultaneously.

---

## 8. The Desktop App (`apps/desktop/`)

An Electron shell that loads the Expo web build on `localhost:8081`. It adds:

- **`desktopBridge`** — a context-bridged IPC object injected into `window` that the mobile web app detects to unlock desktop-specific features:
  - `downloadMedia(id, url, filename)` — native file download with progress events
  - `deleteFile(localUri)` — delete downloaded files
  - `onDownloadProgress(callback)` — IPC event subscription
- Native OS integration (system tray, window management).

---

## 9. Authentication Flow (End-to-End)

```
Register → POST /api/auth/register
  → bcrypt hash password
  → create User record
  → send verification email (Nodemailer)
  → return 201

Verify email → GET /api/auth/verify-email?token=<uuid>
  → mark emailVerified = true
  → delete EmailVerificationToken

Login → POST /api/auth/login
  → validate credentials
  → issue accessToken (JWT, 15min) + refreshToken (opaque UUID, 7d)
  → store RefreshToken in DB (hashed)
  → upsert ActiveSession for this device

Refresh → POST /api/auth/refresh
  → hash inbound token, look up in DB
  → delete old RefreshToken, create new one (rotation)
  → return new accessToken + refreshToken

Logout → POST /api/auth/logout
  → delete RefreshToken from DB
  → delete ActiveSession for this device
```

Mobile stores `accessToken` in `expo-secure-store`. Axios interceptors on the mobile client automatically call the refresh endpoint when a 401 is received and retry the original request.

---

## 10. Testing Strategy

### Server

| Layer       | Tool                                | Approach                                                                                        |
| ----------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Unit        | Vitest                              | Pure functions (StreamParser, resilience policies, auth service) with mocked Prisma             |
| Integration | Vitest + Supertest + Testcontainers | Full HTTP stack against an ephemeral PostgreSQL container — tests the real DB                   |
| Load        | k6                                  | 50 VUs for 50s; requires `NODE_ENV=test` (disables rate limiting)                               |
| E2E Journey | `ts-node`                           | Scripted HTTP calls simulating a full user journey (register → install add-on → browse catalog) |

**Integration test pattern:** Each test file brings up a Postgres container via `@testcontainers/postgresql`, runs `prisma db push` to apply the schema, then tears down the container in `afterAll`. A `setTimeout` delay in teardown allows in-flight async DB operations to complete before disconnecting Prisma — this was a hard-won fix for intermittent connection errors.

**Resilience tests:** `tests/aggregator-resilience.test.ts` tests the Cockatiel policy stack (circuit breaker state transitions, bulkhead rejection, timeout behavior) using msw-style HTTP mocks.

### Mobile

| Layer | Tool                                                 |
| ----- | ---------------------------------------------------- |
| Unit  | Jest + `jest-expo` + `@testing-library/react-native` |
| E2E   | Detox (iOS Simulator)                                |

Detox tests target elements via `testID` props added to key interactive elements across all major screens.

---

## 11. CI/CD (`.github/workflows/ci.yml`)

The GitHub Actions pipeline runs on every push and PR:

1. `npm install` (with dependency integrity check)
2. `turbo run typecheck` — TypeScript across all workspaces
3. `turbo run lint` — ESLint
4. `turbo run test` — Vitest (server) + Jest (mobile)

Turbo's remote cache means unchanged packages are not rebuilt between runs.

---

## 12. Key Intricacies & Gotchas

### Stremio Add-on Protocol

Add-ons are **HTTPS-only JSON REST APIs**. The manifest (`/manifest.json`) declares what resources (`catalog`, `meta`, `stream`) and content types (`movie`, `series`) an add-on supports. Every resource endpoint follows a predictable URL pattern: `/<resource>/<type>/<id>.json`. This is the entire "protocol" — there is no SDK, no WebSocket, no authentication.

### iOS Torrent Playback

iOS's `AVPlayer` cannot handle raw magnet links or MKV containers. The fix is the stream-server daemon: it runs locally, accepts a magnet through a gateway job, warms up WebTorrent metadata/peers, then returns an HTTP stream URL for `expo-video`. The mobile app should never point `expo-video` directly at a magnet. Prefer `/api/gateway/jobs/:id/stream` over the legacy `/stream?magnet=...` path because gateway jobs expose readiness, cancellation, progress, and remux hooks.

### HLS on Non-Web Platforms

HLS (`.m3u8`) streams work natively in `expo-video` on iOS/Android and on Web. They do **not** work for offline downloads (blocked by `DownloadService` with a user-facing error). The reason: HLS is a multi-segment adaptive format; there's no single URL to download.

### React 19 + React Native

`react` and `react-dom` are pinned to `19.2.0` via root `overrides`. Many Expo packages still declare peer dependencies on React 18. Without the override, npm raises `ERESOLVE` errors. This is managed this way deliberately — do not remove the overrides without verifying peer dep compatibility.

### Prisma on PostgreSQL

The schema uses `provider = "postgresql"` — there is **no SQLite fallback** in the current schema. The README mentions SQLite historically but this was migrated. For local development, the simplest approach is a Docker container: `docker run -e POSTGRES_PASSWORD=password -p 5432:5432 postgres`.

### Zod v4

`zod` is pinned to `^4.3.6` via root overrides. Zod v4 has breaking changes from v3 (import paths changed, some APIs renamed). All schemas in `packages/shared/schemas/` use v4 syntax.

### Add-on Policy Cache

The `policyCache` in `aggregator.service.ts` is a **module-level singleton** `Map`. This is intentional: circuit breaker state must persist across HTTP requests to be meaningful. A per-request policy would never open the circuit. In tests, `_resetMetrics()` is available to clear state between test cases.

### Refresh Token Rotation Security

Refresh tokens are single-use (deleted on use, new one issued). If an attacker replays a stolen refresh token, the legitimate token the real user holds becomes invalid — detection signal. The server does not yet implement automatic account lockout on replay detection, but the data is there.

### Desktop Bridge Detection

`DownloadService` and the Chromecast module check for `window.desktopBridge` at runtime. This means the same JavaScript bundle runs in three environments (iOS/Android native, browser, Electron) and adapts behavior dynamically. If `desktopBridge` is absent on web, the code falls back to browser anchor-element downloads.

### Turbo Cache & `dev` task

The `dev` task in `turbo.json` has `"cache": false` and `"persistent": true`. If you run `turbo run dev` it will start all dev servers but never use cached output for them (correct — you can't cache a watch process).

---

## 13. Future Improvement Suggestions

These are concrete, prioritised engineering improvements for anyone extending the system. They are grounded in the current implementation's known gaps.

### High Priority

#### 1. Refresh Token Replay Detection

The current rotation scheme (delete old token → issue new) detects replays by invalidation, but silently fails — the real user just gets a new token. Add an explicit replay detection: if a token that has already been consumed is presented again, immediately invalidate _all_ refresh tokens for that user and force re-authentication. Log the event and optionally notify the user via the notification system.

#### 2. Observability Redaction And Secret Hygiene

Gateway stream URLs are signed, add-on outbound fetches have SSRF guards, and
the current logging baseline redacts the app-controlled server, stream-server,
desktop handoff, mobile ErrorBoundary/Sentry, and DownloadService paths that
previously risked leaking source URLs, bridge tokens, signed stream URLs,
magnets, info hashes, local URIs, or reset tokens.

Still open: configure production Sentry intentionally. Define sampling,
breadcrumb policy, source-map upload, release health, and a final payload audit
for code paths outside the app-controlled ErrorBoundary capture path.

#### 3. Manifest re-validation on Startup

`InstalledAddon` stores the manifest as a JSON blob at install time. If an add-on updates its manifest (changes supported resources, renames catalog IDs), the stored manifest goes stale silently. Add a background job (alongside the Trakt sync scheduler) that re-fetches and re-validates each installed add-on's manifest periodically (e.g., once every 24 hours), updating the stored JSON and notifying users of removals.

### Medium Priority

#### 4. Replace the Policy Cache with a Proper Registry

The `policyCache` in `aggregator.service.ts` is a module-level `Map<string, IPolicy>`. As the number of installed add-ons per user grows, this map grows unboundedly. Introduce a `CircuitBreakerRegistry` class with a max-size LRU eviction policy, and expose it via the health endpoint so operators can see live circuit breaker states — not just metrics.

#### 5. Add a Redis-Backed Rate Limiter

The current rate limiter (`express-rate-limit`) uses in-memory storage. If the server is ever run in multiple instances (behind a load balancer), each instance has its own counter — defeating the rate limit. Replace with `rate-limit-redis` backed by the `ioredis` client already in `package.json` (it's a declared dependency but not yet used for rate limiting).

#### 6. Stream Engine: Subtitle Track Support

`IStreamEngine` declares a `getSubtitleTracks()` method but implementation is incomplete for torrent streams. The stream-server should parse `.srt`/`.ass` files bundled inside torrent archives and expose them as individually addressable HTTP endpoints. `expo-video` supports external subtitle tracks via `SubtitleTrack` objects.

#### 7. Download Resumability After App Restart (Native)

Native downloads persist `resumeData` to `downloadStore` (Zustand + AsyncStorage). However, `DownloadResumable` objects are in-memory — after an app restart, a paused download can only resume if the server still honours the `Range` header for that exact URL, and many stream URLs are tokenised/expiring. Add URL re-resolution logic: before resuming, call `streamEngineManager.getPlaybackUri()` to get a fresh URL, then recreate the `DownloadResumable` with the new URL but the old byte offset.

### Lower Priority / Nice to Have

#### 8. OpenAPI / Swagger Documentation

The Hono app has no machine-readable API spec. Add `@hono/swagger-ui` and use Zod-to-OpenAPI (`zod-openapi`) to derive the spec from the existing Zod validators. This benefits both frontend developers and any external tools (Postman, automated client generation).

#### 9. Structured Logging Correlation IDs

Hono's `requestId` middleware generates per-request IDs stored in context, but the Pino logger instances inside individual domain services (e.g., `traktService`, `addonService`) are not always passed the `requestId`. Introduce a `LogContext` pattern (using Node.js `AsyncLocalStorage`) so every log line emitted during a request lifecycle — including deep inside services — automatically includes `requestId` and `userId` without manual threading.

#### 10. Stream-Server Process Supervision

The desktop app and server-side supervisor have improved bridge startup/diagnostics, and the mobile app can surface bridge health states. Continue hardening this path:

- Keep desktop sidecar startup explicit and logged.
- Make "bridge available" depend on torrent engine availability, not only process reachability.
- Surface `/api/health` and gateway job failures consistently in Sources & Devices.
- Add repair guidance for native CPU/runtime mismatches.

#### 11. Testcontainers Parallelism

Integration tests currently spin up one Postgres container per test file, sequentially. `vitest`'s `--pool=threads` with Testcontainers can run multiple containers in parallel, but requires unique port assignment and careful `beforeAll`/`afterAll` scoping. Worth investigating to cut CI time as the test suite grows.

#### 12. Electron Auto-Update

The desktop app has no update mechanism. Add `electron-updater` (from `electron-builder`) and a simple GitHub Releases-based update feed. This is especially important because the desktop app holds the `desktopBridge` download/cast surface that web users depend on.

---

## 14. Environment Variables Reference

| Variable                             | Default                     | Required | Description                                                                                                                                 |
| ------------------------------------ | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                       | —                           | ✅       | PostgreSQL connection string                                                                                                                |
| `JWT_SECRET`                         | —                           | ✅       | HS256 signing secret (minimum 32 chars recommended)                                                                                         |
| `JWT_ACCESS_EXPIRY`                  | `15m`                       |          | Access token lifetime                                                                                                                       |
| `JWT_REFRESH_EXPIRY`                 | `7d`                        |          | Refresh token lifetime                                                                                                                      |
| `PORT`                               | `3001`                      |          | API server port                                                                                                                             |
| `NODE_ENV`                           | `development`               |          | `test` disables rate limiting                                                                                                               |
| `CORS_ORIGINS`                       | `http://localhost:8081`     |          | Comma-separated allowed origins                                                                                                             |
| `ADDON_TIMEOUT_MS`                   | `5000`                      |          | Per-add-on HTTP timeout (matches Cockatiel timeout policy)                                                                                  |
| `ADDON_MAX_CONCURRENT`               | (configured)                |          | Bulkhead concurrency limit per add-on                                                                                                       |
| `STREAMER_BRIDGE_SUPERVISOR`         | `false`                     |          | Opt-in API server bridge supervision. Keep disabled for desktop flows so Electron owns the bridge sidecar/runtime.                          |
| `STREAMER_BRIDGE_TOKEN`              | —                           |          | Optional bridge control-route token; clients send bearer auth or `x-streamer-bridge-token`.                                                 |
| `STREAMER_GATEWAY_STREAM_SECRET`     | per-process random fallback |          | Optional HMAC secret for signed gateway stream URLs. Defaults to `STREAMER_BRIDGE_TOKEN` when set, otherwise a process-local random secret. |
| `STREAMER_GATEWAY_STREAM_URL_TTL_MS` | `7200000`                   |          | Signed gateway stream URL lifetime. Status polling renews URLs; active streams get a short grace window for range requests.                 |

---

## 15. Local Development Quick Reference

```bash
# 1. Install all workspaces
npm install

# 2. Start Postgres (Docker)
docker run --name streamer-db -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres

# 3. Configure server env
cp server/.env.example server/.env
# Set DATABASE_URL=postgresql://postgres:password@localhost:5432/streamer
# Set JWT_SECRET=<any-long-random-string>

# 4. Push DB schema
npm run db:push --workspace=server

# 5. Start everything (server + stream-server + mobile)
npm run dev

# Or start individually:
npm run dev:server         # :3001
npm run dev:stream-server  # :11470
npm run dev:mobile         # :8081 (Expo)
npm run dev:desktop        # Electron (requires mobile web on :8081 first)

# Desktop owns its bridge sidecar. Keep STREAMER_BRIDGE_SUPERVISOR=false
# unless you explicitly want the API server to supervise a standalone bridge.

# Run tests
npm run test --workspace=server        # Vitest
npm run test --workspace=apps/mobile   # Jest

# Typecheck all
npm run typecheck:all
```
