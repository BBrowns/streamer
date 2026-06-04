# Streamer Agent Handoff

> Last updated: 2026-06-04.
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

Play Best and the player readiness/fallback flow now run through session
events. The next playback-control-plane migration should cover Download or
Cast in a separate reviewable PR.

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

### UI/UX Progress

Some pastel glass/cinematic polish has been added, but the app is not yet at the intended Netflix/Disney+/Prime-quality UX. Treat the current UI as an improved baseline, not as the final revamp.

Known useful direction:

- Keep the provider grouping on Discover; the user specifically likes provider/provider-like rails.
- Move primary flows toward visually calm, pastel glass, cinematic layouts.
- Avoid exposing source complexity as the default path.
- Settings needs a clearer structure:
  Account, Sources & Devices, Playback, Downloads, Advanced.

## Current Known Gaps

### 1. Downloads Are Not Product-Grade Yet

Downloads still need the biggest functional pass after playback readiness:

- Route Download through `PlaybackSession`, using the existing action-aware
  orchestrator as the planning entry point.
- Show a real queue with clear states: queued, preparing, downloading, paused, completed, failed.
- Support pause/resume/delete robustly across platforms.
- Mark items offline-playable only when a verified local file URI exists.
- Keep HLS offline unsupported in v1 unless a proper segment packager is built.
- Torrent downloads on mobile should use the desktop bridge/gateway as resolver/downloader where needed.
- Persist meaningful download/job metadata so restarts do not fake completion.

### 2. Casting Needs Product Flow

Casting is safer than before, but not yet a first-class flow:

- Cast planning already uses `action: "cast"`; migrate its readiness and
  fallback lifecycle onto `PlaybackSession`.
- Cast readiness should be shown before device selection when possible.
- Devices should be displayed cleanly in detail/player.
- Google Cast should remain optional/native when module support exists.
- AirPlay on iOS should use the video player path where possible.
- If a cast device cannot play the selected source, fallback should be automatic.

### 3. Gateway Robustness Still Needs Hardening

Gateway lifecycle exists now, but these are still open:

- Validate range/seek behavior under real video player seeking.
- Consider persistent gateway/download metadata for recoverability.
- Add better cleanup around inactive ready jobs when no player consumes them.
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

Expected work:

- Create a Download `PlaybackSession` from the existing action-aware
  orchestrator result.
- Record bridge/gateway preparation, progress, failure, cancellation, and
  verification events.
- Prevent fake offline completion.
- Add tests for direct file, bridge torrent, browser fallback, HLS unsupported, and Electron local URI behavior.

### PR B: Download Queue UX And Persistence

Goal: make Downloads feel like a real streaming-app queue.

Expected work:

- Add visible queue states and actions.
- Make pause/resume/delete robust.
- Add storage/error clarity.
- Verify local file existence before showing offline playable.
- Add mobile and desktop tests where feasible.

### PR C: Route Cast Through Playback Sessions

Goal: Cast should not bypass the session control plane.

Expected work:

- Create a Cast `PlaybackSession` from the existing `cast` plan.
- Show cast readiness/failure inline.
- Use configured bridge URL and device capability where available.
- Add tests that configured bridge URL is used and localhost is not hard-coded.

### PR D: Real-Device Gateway And Player Validation

Goal: validate production behavior beyond mocked readiness tests.

Expected work:

- Validate range requests, seeking, cancellation, and ready-job cleanup.
- Test real torrents and direct streams on desktop, phone, and web.
- Add golden-path coverage for candidate timeout -> fallback -> first frame.

### PR E: Production Security And Observability

Goal: make the playback control plane diagnosable and release-ready.

Expected work:

- Add focused bridge/add-on/remote-media URL security review and tests.
- Verify Sentry/error reporting without leaking source URLs or tokens.
- Add release/build pipeline coverage and golden-path telemetry.

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
