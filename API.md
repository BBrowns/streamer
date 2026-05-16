# Streamer — Contract & API Reference

> **Audience:** Engineers (human or AI agent) adding new backend endpoints, writing external client apps, or extending the desktop/stream-server bridges.
> This document sits between the backend [ARCHITECTURE.md](./ARCHITECTURE.md) and the frontend [UI.md](./UI.md), documenting the exact boundaries where they communicate.

---

## 1. REST API (Node.js/Hono)

All REST routes are mounted under `/api` and return JSON. Unless specified, all routes require a Bearer token (`Authorization: Bearer <token>`).

### 1.1 Auth & User (`/api/auth`)

| Method   | Route              | Auth Req | Description                                                |
| -------- | ------------------ | -------- | ---------------------------------------------------------- |
| `POST`   | `/register`        | ❌       | Create an account. Returns tokens.                         |
| `POST`   | `/login`           | ❌       | Login. Returns `{ accessToken, refreshToken }`.            |
| `POST`   | `/refresh`         | ❌       | Rotate refresh token. Requires `refreshToken` in body.     |
| `POST`   | `/forgot-password` | ❌       | Initiates password reset via email.                        |
| `POST`   | `/reset-password`  | ❌       | Consumes reset token to change password.                   |
| `PATCH`  | `/profile`         | ✅       | Update profile (theme, displayName, avatar).               |
| `GET`    | `/export`          | ✅       | Exports all user data (library, progress, addons) as JSON. |
| `DELETE` | `/account`         | ✅       | Irreversibly deletes user and cascading records.           |

### 1.2 Aggregator (`/api/aggregator`)

This is the core content fan-out router. It queries all installed add-ons in parallel.

| Method | Route                                 | Description                                                                |
| ------ | ------------------------------------- | -------------------------------------------------------------------------- |
| `GET`  | `/catalog/:type`                      | Fetches aggregated catalog grids (e.g. `movie`, `series`).                 |
| `GET`  | `/search?q={query}`                   | Global search across catalogs.                                             |
| `GET`  | `/meta/:type/:id`                     | Aggregated metadata. Priority: Trakt > TMDB/Cinemeta > Others.             |
| `GET`  | `/stream/:type/:id`                   | Returns list of all playable streams from all add-ons.                     |
| `GET`  | `/stream/resolve/:type/:id/:infoHash` | Unlocks/un-hides Debrid/cached torrent URLs prior to playback.             |
| `POST` | `/stream/resolve-bulk`                | Bulk resolution for episode lists. Body: `{ type, infoHashes: string[] }`. |

### 1.3 Library & Watch Progress (`/api/library`)

| Method   | Route       | Description                                                                  |
| -------- | ----------- | ---------------------------------------------------------------------------- |
| `GET`    | `/`         | Fetches saved library items.                                                 |
| `POST`   | `/`         | Adds item to library. Body: `{ mediaInfo: MediaInfo }`.                      |
| `DELETE` | `/`         | Removes item. Body: `{ itemId }`.                                            |
| `GET`    | `/progress` | Fetches `ContinueWatchingRow` data (progress > 0 && < 100).                  |
| `POST`   | `/progress` | Updates progress. Body: `{ itemId, progress: float, duration: number, ...}`. |

### 1.4 Add-ons (`/api/addons`)

| Method   | Route  | Description                                          |
| -------- | ------ | ---------------------------------------------------- |
| `GET`    | `/`    | Lists all installed add-on manifests for the user.   |
| `POST`   | `/`    | Installs an add-on. Body: `{ manifestUrl: string }`. |
| `DELETE` | `/:id` | Uninstalls an add-on by its ID.                      |

### 1.5 Trakt & Sync (`/api/trakt` & `/api/sync`)

| Method | Route                     | Description                                                                                  |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------- |
| `POST` | `/trakt/connect`          | Completes OAuth flow. Body: `{ code, redirectUri }`.                                         |
| `GET`  | `/trakt/status`           | `true` if connected and token is valid.                                                      |
| `POST` | `/trakt/scrobble/:action` | `action` = `start` \| `pause` \| `stop`. Syncs to Trakt TV.                                  |
| `GET`  | `/sync/events`            | **SSE Endpoint.** Yields realtime events across devices (e.g. session death, notifications). |

---

## 2. Stream-Server API (Local P2P Daemon)

The stream-server runs locally on the device (or on the local network via Docker) on port `:11470`.

### 2.1 Playback

| Method | Route     | Description                                                                                                                                                                 |
| ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/stream` | **The Bridge Endpoint.** Converts a magnet link to HTTP.<br>Query params: `?torrent={infoHash_or_magnet}&fileIndex={number}`. Returns HTTP 206 Partial Content byte ranges. |

### 2.2 Metrics & Health

| Method | Route                            | Description                                             |
| ------ | -------------------------------- | ------------------------------------------------------- |
| `GET`  | `/api/health`                    | Returns memory usage, uptime, and active torrent count. |
| `GET`  | `/api/torrent/:infoHash/metrics` | Returns live download speed, peers, ratio, and swarms.  |
| `GET`  | `/stats`                         | (Legacy) Aggregated daemon stats.                       |

### 2.3 Casting (`/api/cast`)

Google Cast protocol bridging so WebTorrent streams can be dispatched to local Chromecasts.

| Method | Route               | Description                                                  |
| ------ | ------------------- | ------------------------------------------------------------ |
| `GET`  | `/api/cast/devices` | Discovers Chromecasts on the local network via Bonjour/mDNS. |
| `POST` | `/api/cast/play`    | Instructs a discovered device to stream from the bridge.     |
| `POST` | `/api/cast/stop`    | Stops current casting session.                               |

---

## 3. Desktop Bridge IPC (Electron)

When running inside Electron (`apps/desktop`), the web UI cannot write directly to the local filesystem using Node `fs` due to context isolation. It communicates with the main process via the `window.desktopBridge` context bridge.

This contract is consumed by `apps/mobile/services/DownloadService.ts`.

### 3.1 Methods

```typescript
interface DesktopBridge {
  /**
   * Starts downloading a remote URL to the local disk.
   * Returns a promise that resolves with the absolute `file://` local URI.
   */
  downloadMedia(
    id: string,
    downloadUrl: string,
    filename: string,
  ): Promise<string>;

  /**
   * Subscribes to download progress events.
   * Returns an unsubscribe function.
   */
  onDownloadProgress(
    callback: (data: DesktopDownloadProgressData) => void,
  ): () => void;

  /**
   * Deletes a downloaded file from the user's local disk.
   */
  deleteFile(localUri: string): Promise<void>;
}

interface DesktopDownloadProgressData {
  id: string;
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}
```

---

## 4. 401 Refresh Interceptor Flow

Almost all API interaction happens via the Axios instance in `apps/mobile/services/api.ts`. This instance implements an interceptor queue for managing refresh tokens:

1. Request `<A>` returns `401 Unauthorized`.
2. Interceptor pauses `<A>`, checks if a refresh is already in-flight.
3. If not, it requests `POST /api/auth/refresh` using the `refreshToken` from SecureStore.
4. Concurrently, requests `<B>` and `<C>` also return `401`. They are added to the waiting queue.
5. `POST /refresh` completes successfully -> writes new tokens to SecureStore -> resolves `<A>`, `<B>`, and `<C>` queues.
6. Original requests `<A>`, `<B>`, and `<C>` are replayed with the new bearer token.

If `POST /refresh` fails (token revoked or expired > 7 days), the queue is rejected, the user is logged out (`authStore.logout()`), and booted back to the login screen.

---

## 5. API Intricacies

### 5.1 SSE Connection Management

In Hono, Server-Sent Events (`streamSSE`) typically close as soon as the synchronous execution of the handler finishes. To prevent the `/api/sync/events` stream from dying, the server executes an infinite `while (true)` loop that yields a promise every 30 seconds to send a heartbeat (`"ping"` event). The loop is safely terminated when the client disconnects and triggers the `stream.onAbort` callback, which runs cleanup and breaks the reference holding the connection open.

### 5.2 Axios 401 Interceptor Queue

Mobile clients often make parallel requests on startup (e.g., querying `catalog/movies`, `catalog/series`, `library`, and `addons` simultaneously). If the user's `accessToken` has expired, all 4 requests return `401 Unauthorized`. To prevent slamming the server with four concurrent `/api/auth/refresh` requests (which could invalidate tokens due to replay logic), `services/api.ts` implements a Promise Queue. The first 401 pauses all subsequent requests, fires the single refresh call, and upon success, resolves the queue, replaying all original requests with the fresh token.

### 5.3 Aggregator Bulk Resolution

Add-ons often return multiple encoded streams (e.g., Debrid hashes). Resolving them individually (`GET /api/aggregator/stream/resolve/:type/:id/:infoHash`) when displaying a 20-episode TV season causes massive connection overhead. The `/resolve-bulk` endpoint consolidates this, but strictly limits the array to 50 hashes to prevent DoS.

---

## 6. Future Improvement Suggestions

These are concrete, prioritised engineering improvements targeting the API contract and bridging layers.

### High Priority

#### 1. End-To-End Zod Type Safety (tRPC / Hono RPC)

The Hono backend and React frontend both use TypeScript, but currently communicate via standard Axios REST calls. This breaks type safety at the network boundary. Since the codebase is a Monorepo, Hono's `hc` (Hono Client) RPC module can be imported directly into `apps/mobile/services/api.ts`. This would give the mobile app autocomplete and compile-time type-checking against backend routes, completely eliminating "shape mismatch" runtime bugs.

#### 2. Strictly Type the Desktop IPC Bridge

The `window.desktopBridge` context bridge is invoked as `(window as any).desktopBridge` in `DownloadService.ts`. This bypasses TypeScript completely. Create a `global.d.ts` in `apps/mobile` that extends the `Window` interface with the `DesktopBridge` contract, ensuring the frontend code can't invoke non-existent IPC methods or pass incorrectly shaped payloads to the Electron main process.

### Medium Priority

#### 3. Migrate from SSE to WebSockets for Sync

The `/api/sync/events` endpoint relies on Server-Sent Events, which are unidirectional (Server → Client). This requires the mobile app to hit standard REST endpoints (`/api/sessions/command`) for remote control orchestration (e.g., pausing an iPad from the iPhone). Upgrading this to a bidirectional WebSocket (`ws`) connection would allow lower-latency RPC commands between devices and reduce HTTP overhead.

#### 4. Add-on Payload Sanitation Validation

While `server/src/modules/addon` validates add-on manifests via Zod on installation, the `AggregatorService` dynamically fetches catalogues and streams from third-party URLs. If a third-party add-on is compromised and returns malformed JSON or malicious XSS payloads in string fields (e.g., `<script>` in the stream `title`), the server forwards it blindly. Enforce a final `z.parse()` or `z.safeParse()` on all incoming external add-on HTTP responses _before_ returning data to the mobile client.

### Lower Priority

#### 5. Local Network Stream Handoff

When casting to a local display, the torrent bridges via the stream-server (`http://0.0.0.0:11470/stream`). Currently, any device on the local network can access `11470` to watch the stream if they guess the port. Implement a basic symmetric or token-based authentication mechanism between the native mobile app and the local stream-server daemon to lock down local access.
