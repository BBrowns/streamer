# Streamer — Open-Source Media Streaming Aggregator

> A self-hosted, cross-platform alternative to Stremio. Install any Stremio-compatible add-on, browse its catalog, and stream content directly on iOS, Android, Web, or Desktop — all from one app you control.

## What It Does

Streamer aggregates content from third-party add-ons that implement the [Stremio Add-on Protocol](https://github.com/Stremio/stremio-addon-sdk) — a simple, open JSON-over-HTTPS standard. The server fans out requests to all your installed add-ons in parallel, merges the results, and serves them to the mobile/desktop client.

Torrent streams work on all platforms, including iOS, via a local P2P daemon that bridges magnet links to HTTP byte-range streams in real time.

> **Deep dive:** See [ARCHITECTURE.md](./ARCHITECTURE.md) for full system design, module breakdown, resilience patterns, and improvement suggestions.
> **Current handoff:** See [AGENT_HANDOFF.md](./AGENT_HANDOFF.md) for the latest playback/bridge/UI roadmap and next recommended PRs.
> **Playback control plane:** See [PLAYBACK.md](./PLAYBACK.md) for `PlaybackSession` persistence and event rules.
> **UI direction:** See [UI.md](./UI.md) for the pastel glass cinema design direction and current UX guardrails.
> **Release candidates:** See [RC_CHECKLIST.md](./docs/RC_CHECKLIST.md) for release freeze and validation requirements.

---

## Monorepo Structure

```
streamer/
├── apps/
│   ├── mobile/          # Expo SDK 55 — iOS, Android, Web
│   └── desktop/         # Electron shell (wraps the web build)
├── packages/
│   ├── shared/          # TypeScript types & Zod schemas (shared by server + mobile)
│   └── stream-server/   # Local P2P daemon (WebTorrent + Chromecast/Bonjour)
└── server/              # Hono API + Prisma ORM + PostgreSQL
```

---

## Prerequisites

- **Node.js 24.18 LTS** (see `.nvmrc`; Node 25 is not supported)
- **npm 11.18**
- **PostgreSQL** — easiest via Docker:
  ```bash
  docker run --name streamer-db \
    -e POSTGRES_PASSWORD=password \
    -p 5432:5432 -d postgres
  ```
- [k6](https://k6.io/docs/get-started/installation/) _(optional — load testing only)_

---

## Quick Start

### 1. Install dependencies

```bash
nvm install
nvm use
npm install --global npm@11.18.0
npm ci
```

Use `npm install` only when intentionally changing dependencies and committing
the resulting lockfile. Keeping the pinned Node/npm pair is especially
important for Electron and native bridge modules. See
[DEPENDENCY_SECURITY.md](./docs/DEPENDENCY_SECURITY.md) for the audit and
install-script policy.

### 2. Configure the server

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/streamer
JWT_SECRET=<a-long-random-secret-minimum-32-chars>
```

### 3. Initialise the database

```bash
npm run db:push --workspace=server
```

### 4. Start everything

```bash
npm run dev
# Starts server (:3001) + stream-server daemon (:11470) + Expo mobile app (:8081)
```

Or start services individually:

```bash
npm run dev:server          # API server only — http://localhost:3001
npm run dev:stream-server   # P2P daemon only  — http://localhost:11470
npm run dev:mobile          # Expo client only — press 'i' (iOS), 'a' (Android), 'w' (Web)
npm run dev:desktop         # Electron shell   — requires mobile web running on :8081 first
npm run dev:desktop-all     # Desktop-oriented dev flow: API + Expo web + Electron
```

The API server does not start the bridge by default. Desktop starts and owns its
own bridge sidecar so it can choose the correct Node/native-module
architecture. Set `STREAMER_BRIDGE_SUPERVISOR=true` only when you explicitly
want the API server to supervise a standalone bridge process.

---

## Features

| Feature                | Details                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth**               | JWT access tokens (15 min) + rotating refresh tokens (7 d). Email verification, password reset. Rate-limited.                                         |
| **Add-on Registry**    | Install any Stremio-compatible add-on by URL. Manifest validated via Zod on install.                                                                  |
| **Catalog Aggregator** | Parallel fan-out to all installed add-ons; 5 s timeout + circuit breaker per add-on.                                                                  |
| **Library**            | Save movies/series; resume watch progress across devices.                                                                                             |
| **Video Player**       | `expo-video` with session-driven Play Best planning for HLS, MP4, and torrent gateway sources. Real-Debrid is optional and only used when configured. |
| **Downloads**          | Session-driven offline downloads with verified local-file state — native (iOS/Android), Electron bridge (desktop), anchor fallback (web).             |
| **Trakt.tv**           | OAuth integration; auto-scrobbles watch events and syncs history bidirectionally.                                                                     |
| **Casting**            | Session-driven cast preparation with Google Cast SDK where available and Bonjour/castv2 through the desktop bridge.                                   |
| **Notifications**      | In-app notification system; download completion triggers a server-side notification.                                                                  |
| **Resilience**         | Cockatiel circuit breakers, React Error Boundaries, Sentry exception tracking, React Query retry.                                                     |
| **i18n**               | i18next — locale files in `apps/mobile/locales/`.                                                                                                     |

---

## Getting Content

After logging in, go to **Settings -> Sources & Devices** and install at
least one add-on.

**Recommended add-ons to start:**

| Name      | What it provides        | Manifest URL                                 |
| --------- | ----------------------- | -------------------------------------------- |
| Cinemeta  | Movie & series metadata | `https://v3-cinemeta.strem.io/manifest.json` |
| Torrentio | Torrent streams         | `https://torrentio.strem.fun/manifest.json`  |

> Torrent streams via Torrentio require a local bridge. The desktop app starts
> its own bridge sidecar; mobile/native dev flows can run
> `npm run dev:stream-server` or point Sources & Devices at a desktop bridge
> LAN URL.

---

## Current Product Guardrails

- Current phase: architecture complete enough; reliability/productization and
  QA/release evidence are still open.
- The primary playback UX is **Play Best**. Source picking is an advanced
  fallback and should not become the default flow again.
- `PlaybackSession` is the persistence-safe source of truth for Play,
  Download, and Cast. Do not persist raw media URLs, magnets, info hashes, or
  bridge URLs.
- Torrent payloads use an explicit Streamer-owned WebTorrent cache directory
  with TTL and size-cap cleanup. Do not rely on WebTorrent's legacy default
  `/private/tmp/webtorrent` location.
- Remuxed gateway output is materialized to a temporary MP4 before range
  serving, but real-device remux seek behavior and FFmpeg runtime handling
  still need validation/productization.
- Downloads are offline-playable only after a real local file URI is verified.
  Do not show fake offline completion.
- Real-Debrid is optional, disabled by default, paid-service aware, and absent
  from first-run onboarding.
- In the desktop flow, Electron owns the bridge sidecar. The API server bridge
  supervisor is opt-in through `STREAMER_BRIDGE_SUPERVISOR=true`.
- Desktop updates are manual notices only. Do not enable silent downloads or
  installs until signing, release publishing, rollback, and packaged-app QA are
  proven.

---

## Testing

```bash
# Server — unit & integration tests (Vitest + Testcontainers PostgreSQL)
npm run test --workspace=server

# Mobile — unit tests (Jest + Testing Library)
npm run test --workspace=apps/mobile

# All workspaces via Turbo
npm run test:all

# E2E user journey — requires server on :3001
npx ts-node server/tests/e2e-journey.ts

# Load test — 50 VUs for 50 s (requires k6 installed)
NODE_ENV=test npm run dev:server &
k6 run server/tests/k6-load-test.js

# Mobile E2E — Detox on iOS Simulator
npm run test:e2e --workspace=apps/mobile
```

---

## Environment Variables

| Variable                           | Default                 | Required | Description                                                                               |
| ---------------------------------- | ----------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | —                       | ✅       | PostgreSQL connection string                                                              |
| `JWT_SECRET`                       | —                       | ✅       | HS256 signing secret (≥ 32 chars)                                                         |
| `JWT_ACCESS_EXPIRY`                | `15m`                   |          | Access token lifetime                                                                     |
| `JWT_REFRESH_EXPIRY`               | `7d`                    |          | Refresh token lifetime                                                                    |
| `PORT`                             | `3001`                  |          | API server port                                                                           |
| `NODE_ENV`                         | `development`           |          | Set to `test` to disable rate limiting                                                    |
| `CORS_ORIGINS`                     | `http://localhost:8081` |          | Comma-separated allowed origins                                                           |
| `ADDON_TIMEOUT_MS`                 | `5000`                  |          | Per-add-on HTTP request timeout                                                           |
| `ADDON_ALLOW_PRIVATE_NETWORKS`     | `false`                 |          | Dev/test opt-in for local/private add-ons; keep off in production                         |
| `STREAMER_TORRENT_CACHE_DIR`       | platform cache dir      |          | App-owned WebTorrent cache root; macOS defaults to `~/Library/Caches/Streamer/webtorrent` |
| `STREAMER_TORRENT_CACHE_MAX_BYTES` | `8589934592`            |          | Max WebTorrent cache size before oldest inactive entries are evicted                      |
| `STREAMER_TORRENT_CACHE_TTL_MS`    | `86400000`              |          | Stale inactive WebTorrent cache TTL before startup/lifecycle cleanup                      |
| `STREAMER_REMUX_CACHE_MAX_BYTES`   | `5368709120`            |          | Max seekable MP4 remux cache size                                                         |
| `STREAMER_REMUX_CACHE_TTL_MS`      | `1800000`               |          | Stale remux cache TTL                                                                     |

### Torrent Cache Hygiene

The stream-server bridge configures WebTorrent with an explicit app-owned cache
path instead of WebTorrent's default temp directory. On macOS development builds
that path is:

```text
~/Library/Caches/Streamer/webtorrent
```

Override it with `STREAMER_TORRENT_CACHE_DIR` when testing. The bridge cleans
inactive entries on startup, after torrent lifecycle cleanup, and when the
cache exceeds `STREAMER_TORRENT_CACHE_MAX_BYTES`. Active torrent directories are
protected while the WebTorrent client still owns them.

The local bridge also exposes a protected manual cleanup endpoint for inactive
torrent cache entries:

```http
POST /api/cache/torrent/cleanup
```

When `STREAMER_BRIDGE_TOKEN` is configured, call it with either
`Authorization: Bearer <token>` or `x-streamer-bridge-token: <token>`.

If an older development run already filled WebTorrent's legacy default cache,
you can remove only that stale legacy folder:

```bash
rm -rf /private/tmp/webtorrent
```

Do not run broad temp-folder deletes such as `rm -rf /private/tmp/*`.

---

## Useful Commands

```bash
npm run typecheck:all        # TypeScript across all workspaces
npm run lint                 # ESLint (Turbo)
npm run format               # Prettier (all files)
npm run db:studio --workspace=server   # Prisma Studio (DB GUI)
npm run db:seed --workspace=server     # Seed the database
npm run package:dir --workspace=@streamer/desktop    # Build unpacked desktop app
npm run package:check --workspace=@streamer/desktop  # Verify packaged sidecar inputs
```
