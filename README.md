# Streamer — Media Aggregator

A cross-platform media streaming aggregator built on an **Expo SDK 54** mobile client and a **Hono** edge-ready Node.js backend. Compatible with [Stremio-style add-on manifests](https://github.com/Stremio/stremio-addon-sdk).

## 🏗 Monorepo Structure

```
streamer/
├── apps/mobile/          # Expo / React Native (iOS, Android, Web)
├── server/               # Hono API + Prisma + SQLite
├── packages/
│   ├── shared/           # Common TypeScript types & Zod schemas
│   └── stream-server/    # Local P2P daemon (WebTorrent + Chromecast/bonjour)
```

## 🚀 Quick Start

### Prerequisites
- Node.js 24+
- [k6](https://k6.io/docs/get-started/installation/) _(optional, load testing only)_

### 1. Install dependencies
```bash
npm install
```

### 2. Configure the server
```bash
cp server/.env.example server/.env
# Edit server/.env — set a strong JWT_SECRET at minimum
# DATABASE_URL defaults to file:./dev.db (SQLite, no server needed)
```

### 3. Initialise the database
```bash
npm run db:push --workspace=server
```

### 4. Start the API server
```bash
npm run dev:server
# Runs on http://localhost:3001
```

### 5. Start the mobile / web app
```bash
npm run dev:mobile
# Press 'w' for web, 'i' for iOS Simulator
```

## 🛠 Features

- **Auth** — JWT access + refresh tokens with rotation. Rate-limited by default; bypassed in `test` mode.
- **Add-on Registry** — Install, remove, and browse Stremio-compatible add-on manifests.
- **Catalog Aggregator** — Concurrent fan-out to all installed add-ons with 5s timeouts and Cockatiel circuit breakers.
- **Library** — Persist watched items and resume progress per user.
- **Video Player** — `expo-video` powered player with Strategy Pattern stream-engine (HLS, MP4, DASH). Torrent streams require the local stream-server daemon.
- **Casting** — Chromecast device discovery via Bonjour/mDNS (`bonjour-service` + `castv2-client`).
- **UI** — "Glassmorphic Brutalism" design system via NativeWind v4 (Tailwind for React Native).
- **Resilience** — Global React Error Boundaries, Sentry exception tracking, and React Query exponential backoff.

## 🧪 Testing

```bash
# Unit & integration tests (Vitest)
npm run test --workspace=server

# E2E user journey (requires server running on :3001)
npx ts-node server/tests/e2e-journey.ts

# Load test — 50 VUs, 50s (requires k6 + server running in NODE_ENV=test)
NODE_ENV=test npm run dev:server &
k6 run server/tests/k6-load-test.js
```

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite file path (or Turso libSQL URL for production) |
| `JWT_SECRET` | _(required)_ | HS256 signing secret — use a long random string |
| `JWT_ACCESS_EXPIRY` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | `7d` | Refresh token lifetime |
| `PORT` | `3001` | API server port |
| `NODE_ENV` | `development` | `test` disables rate limiting |
| `CORS_ORIGINS` | `http://localhost:8081` | Comma-separated allowed origins |

## 📝 Usage

To see content in the app, install an add-on from the **Settings** tab.

**Recommended add-ons:**
| Name | Manifest URL |
|---|---|
| Cinemeta (movies & series) | `https://v3-cinemeta.strem.io/manifest.json` |
| Torrentio (torrent streams) | `https://torrentio.strem.fun/manifest.json` |
