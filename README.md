# Streamer — Media Aggregator

A cross-platform media streaming service built with Expo SDK 54 and a Node.js Modular Monolith backend.

## 🏗 Registry Structure

- `apps/mobile`: Expo / React Native client (iOS, Android, Web).
- `server`: Node.js Express 5 backend with Prisma & PostgreSQL.
- `packages/shared`: Common TypeScript types and Zod validation schemas.

## 🚀 Quick Start

### 1. Prerequisites
- Docker Desktop
- Node.js 24+

### 2. Infrastructure & Database
```bash
# Start Postgres & Backend
docker compose up -d

# Initialize DB (Run from root)
npm run db:push --workspace=@streamer/server
```

### 3. Run the Client (Web Mode)
```bash
cd apps/mobile
npx expo start --web
```

## 🛠 Features

- **Auth**: JWT-based authentication with refresh token rotation.
- **Aggregator**: Resilient fan-out requests to multiple add-ons using Cockatiel circuit breakers.
- **Add-on Protocol**: Compatible with Stremio-style JSON manifests and resource endpoints.
- **Video Player**: Strategy Pattern implementation. Supports HLS (.m3u8) out of the box.

## 🧪 Testing

```bash
# Run backend tests
npm run test --workspace=server

# Run load tests (requires k6)
k6 run k6/load-test.js
```

## 📝 Usage Tip
To see content in the app, install an add-on in the **Settings** tab. 
**Sample Add-on URL**: `https://v3-cinemeta.strem.io/manifest.json`
