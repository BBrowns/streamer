# Streamer Agent Handoff

> Last updated: 2026-06-05.
> Audience: future human or AI agents continuing the playback, bridge, downloads, casting, and UI/UX work.

This document records the current product direction, what has already been implemented, and the next work needed to move Streamer toward a production-ready streaming app.

## Product North Star

Streamer should feel like a mainstream streaming app: the user browses movies and shows, presses one primary action, and playback works on the current device without making them think about add-ons, torrents, codecs, bridge URLs, peers, or source selection.

The intended UX is closer to Netflix, Disney+, Prime Video, Infuse, and Plex than to a technical source picker:

- Content discovery should be visually rich, provider-aware, and easy to scan.
- Detail pages should prioritize `Play Best`; advanced source picking should be secondary.
- Playback should show clear readiness states instead of endless buffering.
- Downloads should be honestly offline-playable only when a real local file exists.
- Casting should use configured bridge/device state, not hard-coded localhost behavior.
- Real-Debrid remains optional, paid-service aware, disabled by default, and absent from first-run onboarding.

## Current Architecture

Streamer is still using the correct general architecture for this goal:

- `server/` aggregates Stremio-compatible add-ons, metadata, streams, library, auth, and sync.
- `packages/shared/` defines shared playback types, schemas, and stream contracts.
- `apps/mobile/` is the Expo client for iOS, Android, web, and desktop web UI.
- `apps/desktop/` is the Electron shell and local sidecar starter.
- `packages/stream-server/` is the local bridge for torrents, HTTP gateway jobs, Chromecast control, health, metrics, and handoff.

The important direction is not to replace this with Plex/Jellyfin-style library hosting. Plex/Jellyfin are good personal media-server products, but Streamer needs add-on aggregation, dynamic source planning, torrent bridging, download/cast orchestration, and cross-device playback planning. The current architecture can support that if the planner/orchestrator/gateway layers stay centralized.

## What Has Been Implemented Recently

### Add-on And Stream Contracts

Recent work stabilized the server/add-on boundary:

- Aggregate home feed remains `GET /api/catalog/:type`.
- Exact add-on catalog fetching was added for Discover:
  `GET /api/addons/:addonId/catalog/:type/:catalogId`.
- Stremio catalog extras are fetched using path segments instead of query params.
- Single stream resolve route exists:
  `GET /api/stream/resolve/:type/:id/:infoHash`.
- Streams from `/api/stream/:type/:id` include enough `type` and `id` context for resolution.

### Playback Planning Foundation

Playback is now structured around planning rather than rendering-time resolution:

- Device profiles and bridge state are sent to the playback planner.
- Planner v2 ranks and rejects sources server-side using opaque UUID candidate
  IDs, deterministic ordering, typed rejection reasons, action eligibility,
  compatibility details, and timeout budgets.
- Top-level `selectedCandidate`, `fallbackCandidates`, and `orderedCandidates`
  are canonical for new code. The nested `plan` object remains a temporary
  compatibility wrapper for the current mobile resolver.
- Server and mobile validate planner responses with `playbackPlanSchema`.
- The client no longer needs to resolve every visible stream card.
- Source cards should remain cheap metadata views; resolution should happen only on Play, Download, or Cast.

### Typed Playback Orchestration

The mobile app now has typed playback orchestration:

- Shared playback runtime types exist:
  `PlaybackRuntimeState`, `PlaybackErrorCode`, and `PlaybackRuntimeError`.
- `apps/mobile/services/playback/PlaybackErrors.ts` maps planner and resolver failures into typed runtime errors.
- `apps/mobile/services/playback/PlaybackOrchestrator.ts` centralizes `playBest()`.
- The detail screen Play Best path uses the orchestrator to create a
  `PlaybackSession`; it no longer passes a raw fallback stream queue to the
  player.
- Manual advanced source playback still exists and is intentionally separate.

### Playback Session Control Plane

`@streamer/shared` defines a persistence-safe `PlaybackSession` contract for
Play, Download, and Cast orchestration:

- Sessions store opaque candidate snapshots, attempts, gateway job identity,
  typed terminal errors, and an append-only event log.
- Sessions do not persist `Stream` objects, resolved media URLs, magnets, info
  hashes, external URLs, or bridge URLs.
- Session and candidate IDs must be opaque UUIDs, not source-derived values.
- Existing `PlaybackPlan` behavior remains supported while Download and Cast
  migrate onto the session model.

The mobile client now also has:

- `services/playback/PlaybackSessionReducer.ts`, a pure typed reducer for
  session creation and append-only lifecycle events
- `stores/playbackSessionStore.ts`, which persists only schema-valid sessions
  and keeps planner candidates in a transient in-memory runtime map; it also
  exposes typed helpers for attempts, gateway progress, fallback, failure, and
  cancellation
- `services/playback/PlaybackSessionPlaybackService.ts`, which resolves Play
  Best candidates in planner order, applies timeout budgets, records gateway
  progress, performs automatic fallback, and cancels active engines/jobs
- explicit `requiresReplan` behavior when a persisted session is rehydrated
  without its runtime candidate mapping

Session-local candidate IDs are newly generated UUIDs and are not planner
candidate IDs. Do not persist or reconstruct the runtime candidate map.

The Redis-backed remote-control presence records in `useRemoteControl.ts` and
`server/src/modules/sessions/session.service.ts` are a separate legacy concept
despite currently sharing the `PlaybackSession` name.

Play Best, the player readiness/fallback flow, and the primary Download action
now run through session events. The next playback-control-plane migration
should cover Cast in a separate reviewable PR.

See [PLAYBACK.md](./PLAYBACK.md) before changing playback persistence or adding
new session event payloads.

### Player Runtime State

The player now stores and displays typed playback readiness:

- `playerStore` tracks `runtimeState` and `runtimeError`.
- Player failures are mapped into typed errors:
  - `BRIDGE_UNAVAILABLE`
  - `BRIDGE_UNSUPPORTED`
  - `NO_PEERS`
  - `UNSUPPORTED_CODEC`
  - `PLAYBACK_TIMEOUT`
  - `SOURCE_UNAVAILABLE`
  - `NETWORK_OFFLINE`
- Fallback transitions use `trying_fallback`.
- `PlayerStatusOverlay` reads session readiness, gateway progress, fallback,
  and terminal errors for better titles and retry behavior.
- Torrent metrics no longer mark playback as playing before the video player
  reports a playable frame.
- First-frame timeout and navigation-away cancellation are recorded through
  the active session, preventing indefinite generic buffering and dangling
  gateway jobs.

### Gateway Job Lifecycle

The stream-server gateway has moved closer to production behavior:

- Gateway jobs expose `phase`, `progress`, `peerCount`, `elapsedMs`, and timeout metadata.
- Gateway jobs support `cancelled` state.
- Authenticated cancellation exists:
  `DELETE /api/gateway/jobs/:id`.
- Cancelled streams return `410`.
- Late warmup completion cannot overwrite cancellation.
- Mobile `TorrentEngine` emits gateway progress and cancels active jobs on stop/timeout.
- Player controller maps gateway phases into runtime states:
  - `creating_gateway_job`
  - `finding_peers`
  - `preparing_metadata`
  - `buffering`
  - `cancelled`

### Bridge Diagnostics And Security

Bridge behavior is safer and more explicit:

- Bridge states include available, unreachable, wrong URL, loading, no peers, and unsupported.
- Bridge auth is supported through bearer token or `x-streamer-bridge-token`.
- Gateway, metrics, stream, stats, and cast/control routes are covered by auth tests where relevant.
- CPU/native architecture mismatch is surfaced as unsupported bridge health instead of silently appearing available.
- Server, mobile, desktop, and stream-server logs now have a baseline redaction
  pass for bridge tokens, bearer tokens, reset tokens, signed gateway URLs,
  magnets, source URLs, local file URIs, and torrent info hashes in the touched
  playback/download/cast/error-reporting paths.

### UI/UX Progress

Some pastel glass/cinematic polish has been added, but the app is not yet at the intended Netflix/Disney+/Prime-quality UX. Treat the current UI as an improved baseline, not as the final revamp.

Known useful direction:

- Keep the provider grouping on Discover; the user specifically likes provider/provider-like rails.
- Move primary flows toward visually calm, pastel glass, cinematic layouts.
- Avoid exposing source complexity as the default path.
- Settings needs a clearer structure:
  Account, Sources & Devices, Playback, Downloads, Advanced.

## Current Known Gaps

### 1. Downloads Need Real-Device Validation

The main download queue and persistence pass is complete:

- Primary Download routes through `PlaybackSession`, using the existing
  action-aware orchestrator as the planning entry point.
- Download sessions record bridge/gateway preparation, coarse URL-free
  progress, failure, cancellation, local-file verification, and completion.
- The Downloads screen presents active, attention, and ready-offline groups
  with visible pause, resume, retry, play, delete, filter, storage, and error
  states.
- Offline badges and library filtering use one verified-local-file invariant.
- Electron persists managed download-job metadata and restores interrupted jobs
  as recoverable paused items after restart.
- Electron local-file playback, verification, and deletion are constrained to
  the app-managed offline-media directory.

Still open:

- Validate pause, resume, delete, restart recovery, and storage reporting with
  real large files on desktop, iPhone, and Android.
- Keep HLS offline unsupported in v1 unless a proper segment packager is built.
- Torrent downloads on mobile should use the desktop bridge/gateway as
  resolver/downloader where needed.
- Persisted retry URLs may expire; a future pass should re-plan sources instead
  of relying indefinitely on an old resolved URL.

### 2. Casting Needs Native And Real-Device Validation

Casting now uses the playback session control plane for the primary flow:

- Cast readiness is prepared and shown before device selection when possible.
- Cast source resolution, display-start failure, and automatic fallback are
  recorded on `PlaybackSession`.
- Configured bridge URLs are used for discovery, playback, and control.
- Bridge-backed cast sessions remain active until the user stops casting so
  their gateway jobs are not cancelled early.

Still open:

- Validate discovery, HLS, direct MP4, torrent gateway, stop, and fallback on
  real Chromecast devices.
- Google Cast should remain optional/native when module support exists.
- AirPlay on iOS should use the video player path where possible.
- Consider richer device-specific capability discovery when a reliable source
  is available.

### 3. Gateway Robustness Still Needs Hardening

Gateway lifecycle exists now, but these are still open:

- Direct-file gateway range handling now supports bounded, open-ended, and
  suffix requests, clamps ranges to file boundaries, and rejects
  unsatisfiable requests with `416`. Validate this under real video player
  seeking.
- Consider persistent gateway/download metadata for recoverability.
- Unused ready jobs are now pruned periodically, while jobs with active stream
  consumers are protected from cleanup.
- FFmpeg remux output is still sequential and needs a packaged or persistent
  output strategy before remuxed sources can support reliable seeking.
- Test with real torrents and direct streams on desktop, phone, and web.

### 4. UI/UX Revamp Is Still Incomplete

Home, detail, and settings now have a stronger pastel glass/cinematic baseline,
but the UI is not yet the full visual/product redesign the user wants:

- Continue refining Home around hero, continue watching, provider rails,
  recommendations, and bridge status.
- Discover provider grouping should be kept and expanded with provider, genre, quality, and type filtering.
- Continue refining Detail hierarchy around `Play Best` and collapsed advanced
  sources.
- Continue refining the reorganized Settings and Sources & Devices screens.
- Player controls should feel more professional and less like a generic overlay.
- Desktop and phone layouts need screenshot-driven QA.

### 5. Production Readiness Is Still Open

Before this can be considered production-ready:

- CI/CD needs stable desktop/mobile/server/stream-server build and test coverage.
- Release pipelines are needed for desktop and mobile.
- Sentry/error reporting should be verified across server, mobile, desktop, and bridge.
- Secrets/env management needs review.
- Bridge, add-on URLs, auth, cast URLs, and remote media URLs need a focused security review.
- Privacy export/delete flows should be verified end-to-end.
- Golden path tests should cover browse -> Play Best -> fallback -> download -> cast.

## Recommended Next PR Sequence

Use small reviewable PRs. Do not combine UX redesign, download architecture, gateway internals, and CI in one PR.

### PR A: Route Download Through Playback Sessions

Goal: make Download use the same inspectable session lifecycle as Play Best.

Status: **Complete.**

Implemented:

- Creates a Download `PlaybackSession` from the existing action-aware
  orchestrator.
- Records bridge/gateway preparation, URL-free progress, failure,
  cancellation, and local-file verification events.
- Prevents new fake offline completion.
- Covers direct file, bridge torrent, browser fallback, HLS unsupported, and
  Electron local URI behavior in tests.

### PR B: Download Queue UX And Persistence

Goal: make Downloads feel like a real streaming-app queue.

Status: **Complete.**

Implemented:

- Adds visible active, attention, and ready-offline queue sections with direct
  actions, filters, progress, storage totals, and persisted safe error text.
- Makes pause, resume, retry, delete, and delete-all operate through
  `DownloadService` instead of clearing UI state without deleting files.
- Requires a verified local URI before any download is shown as offline
  playable across Downloads, Library, Detail, and source cards.
- Reconciles persisted mobile queue state with Electron jobs and local files.
- Persists Electron download-job metadata for restart recovery and constrains
  `streamer://` local-file access to managed offline media.
- Adds mobile queue/service/component tests and desktop path-boundary tests.

### PR C: Route Cast Through Playback Sessions

Goal: Cast should not bypass the session control plane.

Status: **Complete.**

- Create a Cast `PlaybackSession` from the existing `cast` plan.
- Show cast readiness/failure inline.
- Use configured bridge URL and device capability where available.
- Add tests that configured bridge URL is used and localhost is not hard-coded.

### PR D: Real-Device Gateway And Player Validation

Goal: validate production behavior beyond mocked readiness tests.

Status: **Merged in PR #73.**

Implemented:

- Adds strict single byte-range handling for direct gateway streams, including
  open-ended, suffix, clamped, `HEAD`, and unsatisfiable requests.
- Adds periodic cleanup for unused ready jobs without pruning active stream
  consumers.
- Add golden-path coverage for candidate timeout -> fallback -> first frame.

Still open:

- Validate seeking, cancellation, and cleanup with real torrents and direct
  streams on desktop, phone, and web.
- Decide on a packaged or persistent remux strategy before claiming seek
  support for FFmpeg-remuxed sources.

### PR E: Security Baseline And Trust Boundaries

Goal: harden the production trust boundaries before deeper observability work.

Status: **Complete.**

Implemented:

- Add-on manifest/catalog/meta/stream fetches validate every outbound target,
  block private/internal/reserved IP ranges by default, and validate redirect
  targets before following them.
- Local/private add-ons require explicit `ADDON_ALLOW_PRIVATE_NETWORKS=true`
  opt-in for tests or development.
- Mobile bridge URLs are constrained to trusted local/LAN URLs before playback
  and cast services use them.
- Source-bearing logs were reduced: resolved stream URLs, local download URIs,
  raw magnets, and torrent info hashes are no longer emitted by the touched
  playback/bridge paths.
- Adds focused server and mobile tests for SSRF, redirects, configured bridge
  URLs, and cast bridge routing.

Follow-ups moved to the next security hardening PRs.

### PR F: Signed Gateway Stream URLs

Goal: keep native player and cast URLs header-free while preventing unsigned
gateway stream URL reuse.

Status: **Merged in PR #74.**

Implemented:

- Gateway job responses now return signed
  `/api/gateway/jobs/:id/stream?expires=...&signature=...` URLs.
- The stream route validates the HMAC signature and expiry before preparing or
  serving torrent bytes.
- Signing uses `STREAMER_GATEWAY_STREAM_SECRET` when configured, otherwise
  falls back to `STREAMER_BRIDGE_TOKEN`, then a per-process random secret.
- Status polling renews the signed playback URL while the job can stream.
- Expired URLs are accepted only when they match the same signature already
  used by the active stream and stay inside a short grace window, so ongoing
  byte-range requests do not fail mid-playback.
- Adds stream-server tests for unsigned, tampered, expired, renewed, and
  active-grace stream URLs.

Follow-ups:

- Do a follow-up Sentry/error-reporting pass that verifies breadcrumbs and
  exceptions do not contain source URLs, signed stream URLs, bridge tokens, or
  magnets.
- Add release/build pipeline coverage and golden-path telemetry.

### PR G: Observability Redaction And Secret Hygiene

Goal: make logs and app-controlled telemetry safer before production
observability is expanded.

Status: **Complete.**

Implemented:

- Adds a central server log redaction hook that recursively redacts sensitive
  object keys, bearer tokens, bridge tokens, reset/verification query tokens,
  signed gateway stream URLs, magnets, source/download URLs, local URIs, and
  info hashes before Pino emits log entries.
- Removes explicit password reset token logging and redacts development email
  debug output while preserving enough context to debug email delivery.
- Adds stream-server redaction for WebTorrent, FFmpeg, cast, subtitle, handoff,
  and gateway-stream construction errors, and removes raw info hash/magnet
  lifecycle logs from the touched bridge paths.
- Adds mobile redaction for ErrorBoundary console/Sentry payloads and
  DownloadService error/local-URI logs.
- Adds focused server, stream-server, and mobile redaction tests.

Known limitations:

- This does not configure full production Sentry sampling, release health,
  breadcrumb policy, or source-map upload.
- The non-production forgot-password response still returns a reset token for
  local UI flow compatibility; it is no longer logged.
- Subtitle URLs can still carry an encoded magnet as part of the current API
  response contract; they should be moved to opaque/signed identifiers in a
  later bridge API hardening pass.

### PR H: Mobile Production Sentry Baseline

Goal: configure mobile Sentry intentionally now that app-controlled telemetry
redaction exists.

Status: **Complete.**

Implemented:

- Mobile Sentry initialization now uses explicit environment, release, error
  sample rate, and trace sample rate settings.
- Sentry remains disabled without `EXPO_PUBLIC_SENTRY_DSN`, disabled in tests,
  and disabled in development unless `EXPO_PUBLIC_SENTRY_ENABLE_DEV=true`.
- Default tracing is conservative in production and off in development.
- `sendDefaultPii` is disabled.
- `beforeSend` and `beforeBreadcrumb` recursively redact bridge tokens, bearer
  tokens, signed gateway URLs, magnets, source/download URLs, local URIs, and
  info hashes.
- Expo Router's global error boundary captures and renders redacted errors.

Known limitations:

- Server, desktop, and stream-server Sentry/observability integrations are not
  added in this PR. Add those in a separate dependency-bearing PR.
- Sentry source-map upload still depends on real organization/project/env
  configuration in the release pipeline.
- Session replay remains intentionally unconfigured for privacy.

### PR I: Server And Bridge Sentry Baseline

Goal: add production-safe Sentry capture for backend and local bridge failures
without weakening the existing redaction baseline.

Status: **Complete.**

Implemented:

- Adds `@sentry/node` to the server and stream-server workspaces.
- Server Sentry initialization is disabled without `SENTRY_DSN`, disabled in
  tests, and disabled in development unless `SENTRY_ENABLE_DEV=true`.
- Stream-server Sentry initialization supports bridge-specific env vars first
  (`STREAMER_BRIDGE_SENTRY_*`) and common `SENTRY_*` fallbacks.
- Server Hono unhandled 500 errors, startup errors, and stream-server
  supervisor startup failures are captured with sanitized context.
- Stream-server Express route errors and listen errors are captured with
  sanitized context.
- Both services use conservative production tracing, no default PII, and
  redacted `beforeSend`/`beforeBreadcrumb` hooks.
- Adds focused server and stream-server tests for enablement, sampling, PII
  handling, and signed URL/magnet/token redaction.

Known limitations:

- Source-map upload, release creation, and deploy metadata are still release
  pipeline work.
- This PR does not enable Sentry by default; production must provide DSNs and
  release/environment env vars.

### PR J: Electron Main-Process Sentry Baseline

Goal: add production-safe Sentry capture for Electron main-process failures
without enabling renderer telemetry or changing crash semantics.

Status: **In review.**

Implemented:

- Adds `@sentry/electron` to the desktop workspace and copies the Sentry helper
  into `dist` during the desktop build.
- Electron main-process Sentry initialization supports desktop-specific env vars
  first (`STREAMER_DESKTOP_SENTRY_*`) and common `SENTRY_*` fallbacks.
- Sentry remains disabled without a DSN, disabled in tests, and disabled in
  development unless `STREAMER_DESKTOP_SENTRY_ENABLE_DEV=true` or
  `SENTRY_ENABLE_DEV=true`.
- Captures auto-updater errors, bridge daemon spawn/exit/start failures,
  Bonjour discovery failures, system tray creation failures, download
  persistence/restore errors, and uncaught exceptions through
  `uncaughtExceptionMonitor` so normal Node/Electron crash behavior is not
  swallowed.
- Uses conservative production tracing, no default PII, and redacted
  `beforeSend`/`beforeBreadcrumb` hooks for bearer tokens, signed gateway URLs,
  magnets, source/download URLs, local URIs, info hashes, and common secret
  keys.

Known limitations:

- Renderer-process Sentry and session replay remain intentionally unconfigured
  for privacy and scope control.
- Source-map upload, release creation, release health, and deploy metadata are
  still release pipeline work.
- This PR does not enable Sentry by default; production must provide DSNs and
  release/environment env vars.

## Engineering Rules For Future Agents

- Start every task from updated `master`.
- Use `codex/<task-name>` branch names.
- Keep commits small and named by purpose.
- Do not stage unrelated local changes. In recent local worktrees, `package.json` and `package-lock.json` have sometimes contained unrelated Playwright dependency edits; only include them if the current task explicitly needs them.
- Use the GitHub MCP for PR creation when available.
- Use the Browser plugin for local UI smoke tests after meaningful frontend changes.
- Use the `get-api-docs`/Chub skill when implementing against an external API or library whose current docs matter.
- Keep Real-Debrid optional, disabled by default, and absent from first-run onboarding.
- Prefer typed planner/orchestrator contracts over stringly typed UI logic.
- Prefer user-facing states over raw alerts for playback/download/cast failures.

## Validation Baseline

For playback/bridge/mobile work, run at least:

```bash
npm run format:check
npm run typecheck:all
npm run test --workspace=apps/mobile -- --runInBand
npm run test --workspace=@streamer/stream-server
```

For server/add-on work, also run:

```bash
npm run test --workspace=server
```

When touching desktop/Electron or UI layout, add manual/browser smoke validation and include screenshots in the PR.
