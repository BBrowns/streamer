# Streamer Agent Handoff

> Last updated: 2026-07-14.
> Audience: future human or AI agents continuing the playback, bridge, downloads, casting, and UI/UX work.

This document records the current product direction, what has already been implemented, and the next work needed to move Streamer toward a production-ready streaming app.

## Current Project Phase

The macro playback architecture is complete enough for the next phase. Do not
restart the project around a different control plane.

Current phase:

- Architecture complete enough: `PlaybackSession`, Planner v2, session-driven
  Play Best, downloads, cast, gateway/range hardening, security baseline,
  Sentry/build metadata, desktop sidecar/package inputs, manual update policy,
  and first UI primitives are already present.
- Reliability/productization phase: dependency security, deterministic
  golden-path automation, unified bridge/action preflight, mobile/server
  release configuration, recoverable offline/cast UX, and the focused
  accessibility/responsive visual-quality pass are in place.
- QA and release evidence still open: real-device QA and release-candidate
  evidence are required before making production-ready or release-ready claims.

The active implementation roadmap is complete through **PR #151** in
[ROADMAP.md](./ROADMAP.md). Real-target QA and RC evidence remain intentionally
deferred until the required targets and release credentials are available. PR
#142 is the roadmap truth-sync that defined this post-#141 phase.

PR #143 establishes the dependency-security baseline: Node 24.18 LTS and npm
11.18 are the supported toolchain, production high/critical audit findings
block CI, and every dependency install script must be explicitly reviewed and
version-pinned. See [docs/DEPENDENCY_SECURITY.md](./docs/DEPENDENCY_SECURITY.md).
The root `dev:stream-server` command validates native dependency architecture
and selects a matching Node 24 runtime. If a checkout has mixed Rosetta/arm64
artifacts, use `npm run dev:repair-native`; do not work around the guard by
running a bridge with an unavailable torrent engine.
Deterministic renderer regression coverage is documented in
[docs/AUTOMATED_GOLDEN_PATHS.md](./docs/AUTOMATED_GOLDEN_PATHS.md).
The numbered roadmap items through **PR #124** are implemented, and follow-up
reliability/productization PRs have landed through **PR #151**. Earlier roadmap
items that introduced
PlaybackSession, Planner v2, downloads via sessions, cast via sessions, Sentry
baseline, security baseline, CI gates, packaging inputs, macOS signing config,
manual updates, More Sources/debug bundle, and RC checklist docs should be
treated as complete unless new code contradicts this document.

Post-roadmap corrective PRs after #124:

- **PR #125:** fixed UI overlap regressions in Home/Downloads/Player, removed
  the disliked shortcut bars, and tightened source ranking for obvious dubbed
  labels.
- **PR #126:** required remux gateway jobs to remain in preparation until the
  seekable MP4 cache is actually ready to serve.
- **PR #127:** required non-remux torrent gateway jobs to prove first-byte
  readability before reporting `ready`, reducing false bridge-ready buffering.
- **PR #128:** added planner-visible audio language metadata, subtitle
  preference propagation, and player audio/subtitle track selection through
  `expo-video` where available.
- **PR #129:** synced docs after the playback follow-up work so future agents
  start from the implemented architecture rather than the older plan.
- **PR #130:** added a bridge playback readiness self-test that can prove the
  bridge can prepare and expose playback-ready streams instead of only reporting
  process health.
- **PR #131:** sanitized playback planner request payloads so client-only fields
  do not trigger server-side `400` responses.
- **PR #132:** converted terminal gateway bridge states such as `no_peers` and
  `stalled` into typed terminal playback states instead of streams that sit in
  endless buffering.
- **PR #133:** polished Home, Downloads, and Player overlap regressions after
  the UX passes, including removal of the disliked empty Home shortcut area.
- **PR #134:** moved WebTorrent storage into an explicit Streamer-owned cache
  directory with TTL cleanup, size-cap eviction, active torrent protection,
  lifecycle cleanup, health diagnostics, and docs for the legacy
  `/private/tmp/webtorrent` cleanup path.
- **PR #135:** refreshed handoff and QA docs after the cache hygiene work so
  the active roadmap reflects merged work through #134.
- **PR #136:** surfaces torrent cache diagnostics from bridge health into
  Sources & Devices advanced diagnostics, next to FFmpeg/remux cache status.
- **PR #137:** adds a protected bridge endpoint for manual inactive torrent
  cache cleanup and isolates stream-server cache tests from the real app cache.
- **PR #138:** adds a Sources & Devices action that calls the protected torrent
  cache cleanup endpoint with bridge auth and refreshes bridge diagnostics.
- **PR #139:** prevents native torrent downloads from appearing offline-eligible
  when the configured bridge URL is device-local loopback instead of a
  LAN-reachable desktop bridge URL.
- **PR #140:** surfaces the same native loopback bridge URL problem directly in
  Sources & Devices so mobile users know to paste the desktop LAN URL before
  torrent playback, downloads, or casting.
- **PR #141:** keeps download eligibility side-effect-light by avoiding bridge
  URL resolution when the bridge is already unavailable.
- **PR #142:** truth-synced the post-#141 roadmap and current architecture.
- **PR #143:** established the Node/npm dependency policy, blocking production
  audit gate, reviewed install-script allowlist, and documented exceptions.
- **PR #144:** added deterministic phone-web and desktop-renderer golden paths
  for Play Best, fallback, terminal no-peers, bridge guidance, download, and
  cast eligibility without claiming native or packaged target evidence.
- **PR #145:** centralized Play, Download, Cast, Settings, and planner bridge
  readiness in a shared, side-effect-light preflight contract with typed
  reasons for URL scope, reachability, auth, runtime, gateway, torrent, remux,
  and cast capability failures.
- **PR #146:** established stable Expo/native application identity, validated
  API/Sentry/build/update app configuration, explicit EAS build environments
  and channels, and a credential-free mobile configuration check in CI. Real
  EAS builds and store credentials remain release evidence, not completed QA.
- **PR #147:** hardened server production startup around explicit instance
  topology, strong secrets, exact origins, proxy trust, SMTP delivery and Redis
  requirements; enabled global API rate limiting, split liveness/readiness, and
  added bounded shutdown behavior plus deployment documentation.
- **PR #148:** added typed, privacy-safe recovery reasons and one clear next
  action for interrupted, missing, storage-constrained, unsupported, expired,
  and bridge-dependent downloads, plus cast discovery, device, compatibility,
  loopback, remux, bridge, and fallback failures.
- **PR #149:** fixed stream-server development startup across Rosetta/native
  CPU boundaries, added an explicit native dependency repair command, made the
  shared workspace ESM contract explicit, and added runtime selection coverage
  to CI.
- **PR #150:** hardened shared controls, focus, touch targets, screen-reader
  semantics and reduced-motion behavior; removed nested web buttons; fixed the
  Downloads inline empty-state overlap; and added deterministic phone/desktop
  visual QA artifacts.
- **PR #151:** routed API, Expo, Expo web, and desktop development entrypoints
  through the same supported Node/native-architecture guard as the bridge.

## Product North Star

Streamer should feel like a mainstream streaming app: the user browses movies and shows, presses one primary action, and playback works on the current device without making them think about add-ons, torrents, codecs, bridge URLs, peers, or source selection.

The intended UX is closer to Netflix, Disney+, Prime Video, Infuse, and Plex than to a technical source picker:

- Content discovery should be visually rich, provider-aware, and easy to scan.
- Detail pages should prioritize `Play Best`; advanced source picking should be secondary.
- Playback should show clear readiness states instead of endless buffering.
- Downloads should be honestly offline-playable only when a real local file exists.
- Casting should use configured bridge/device state, not hard-coded localhost behavior.
- Cast devices cannot consume localhost-only playback URLs; client and bridge
  paths must preflight loopback URLs and prefer LAN-reachable bridge URLs or
  compatible remote sources.
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
- Existing `PlaybackPlan` behavior remains supported as a compatibility wrapper.
  Primary Play, Download, and Cast flows now use the session model.

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

Play Best, the player readiness/fallback flow, the primary Download action,
and primary Cast now run through session events.

See [PLAYBACK.md](./PLAYBACK.md) before changing playback persistence or adding
new session event payloads.

Use [docs/QA_MATRIX.md](./docs/QA_MATRIX.md) as the canonical record for
real-target playback, download, cast, bridge, and remux validation. Local unit
tests are not enough to mark a runtime supported.

Use [docs/RC_CHECKLIST.md](./docs/RC_CHECKLIST.md) before cutting or validating
a release candidate. The checklist is intentionally conservative and should not
be marked complete without real target evidence.

Use [docs/ADDON_TRUST_MODEL.md](./docs/ADDON_TRUST_MODEL.md) before changing
add-on manifest/resource fetching, source URL validation, redirect handling, or
private-network development exceptions.

Use [docs/ELECTRON_SECURITY.md](./docs/ELECTRON_SECURITY.md) before changing
Electron `BrowserWindow` settings, preload APIs, IPC handlers, external link
handling, webview behavior, custom protocols, or desktop local-file access.

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

- Gateway jobs expose `state`, `phase`, `progress`, `peerCount`, `elapsedMs`,
  retryability, and timeout metadata.
- Gateway jobs support explicit `no_peers`, `stalled`, `cancelled`, and
  `expired` states instead of collapsing every non-ready result into generic
  `error`.
- Authenticated cancellation exists:
  `DELETE /api/gateway/jobs/:id`.
- Cancelled streams return `410`.
- Late warmup completion cannot overwrite cancellation.
- WebTorrent now uses an explicit Streamer-owned cache root instead of the
  library default temp path. Default macOS/dev location is
  `~/Library/Caches/Streamer/webtorrent`; fallback is
  `path.join(os.tmpdir(), "streamer", "webtorrent")`.
- Torrent cache hygiene is controlled by:
  - `STREAMER_TORRENT_CACHE_DIR`
  - `STREAMER_TORRENT_CACHE_MAX_BYTES` (default 8 GiB)
  - `STREAMER_TORRENT_CACHE_TTL_MS` (default 24 hours)
- The bridge cleans inactive torrent cache entries on startup and lifecycle
  cleanup, removes pruned/cancelled torrent directories when safe, protects
  active torrent directories, and exposes `torrentCache` diagnostics from
  `/api/health`.
- If an old dev run filled the legacy WebTorrent default cache, remove only
  that folder with `rm -rf /private/tmp/webtorrent`; do not delete broader
  temp directories.
- Mobile `TorrentEngine` emits gateway progress, treats `no_peers` and
  `stalled` as terminal for the current candidate, maps `no_peers` to bridge
  status, and cancels active jobs on stop/timeout.
- Gateway progress events can carry these phases; the player maps active
  preparation phases into user-facing copy, while terminal phases drive
  fallback or failure:
  - `creating_gateway_job`
  - `finding_peers`
  - `no_peers`
  - `preparing_metadata`
  - `fetching_metadata`
  - `selecting_file`
  - `checking_piece_availability`
  - `stalled`
  - `remuxing`
  - `ready`
  - `error`
  - `buffering`
  - `cancelled`
  - `expired`

### Bridge Diagnostics And Security

Bridge behavior is safer and more explicit:

- Bridge states include available, unreachable, wrong URL, loading, no peers, and unsupported.
- Bridge auth is supported through bearer token or `x-streamer-bridge-token`.
- Gateway, metrics, stream, stats, and cast/control routes are covered by auth tests where relevant.
- CPU/native architecture mismatch is surfaced as unsupported bridge health instead of silently appearing available.
- Sources & Devices exposes bridge restart, runtime re-check, repair steps,
  FFmpeg/remux runtime diagnostics, remux cache status, and a safe redacted
  diagnostics export for support.
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
- Settings is now clearer but still not final. It groups Sources & Add-ons,
  Playback & Downloads, Account & Sync, Application, About & Updates, and
  Privacy & Data. Sources & Devices remains the detailed readiness/diagnostics
  surface.

## Current Known Gaps

### 1. Downloads Need Real-Device Validation

The main download queue and persistence pass is complete:

- Primary Download routes through `PlaybackSession`, using the existing
  action-aware orchestrator as the planning entry point.
- Download sessions record bridge/gateway preparation, coarse URL-free
  progress, failure, cancellation, local-file verification, and completion.
- The Downloads screen presents active, attention, and ready-offline groups
  with visible pause, resume, retry, verify, play, delete, filter, storage, and
  error states. Completed-but-unverified files are shown as "Needs
  verification" and remain outside the ready-offline group until local-file
  verification succeeds.
- Offline badges and library filtering use one verified-local-file invariant.
- Electron persists managed download-job metadata and restores interrupted jobs
  as recoverable paused items after restart.
- Electron local-file playback, verification, and deletion are constrained to
  the app-managed offline-media directory.
- Download queue persistence now strips resolved download URLs, resume data, and
  raw `Stream` objects. Restart recovery uses safe content replan metadata or
  runtime-only source data.
- Failed and paused queue items now derive one context-specific recovery action
  from a persisted non-sensitive failure reason: resume, replan, verify, free
  storage, repair the bridge, or remove an unsupported item.

Still open:

- Validate pause, resume, delete, restart recovery, and storage reporting with
  real large files on desktop, iPhone, and Android.
- Keep HLS offline unsupported in v1 unless a proper segment packager is built.
- Torrent downloads on mobile should use the desktop bridge/gateway as
  resolver/downloader where needed.
- Validate safe replan-on-resume with real large files after app restart on
  desktop, iPhone, and Android.

### 2. Casting Needs Native And Real-Device Validation

Casting now uses the playback session control plane for the primary flow:

- Cast readiness is prepared and shown before device selection when possible.
- Cast source resolution, display-start failure, and automatic fallback are
  recorded on `PlaybackSession`.
- Configured bridge URLs are used for discovery, playback, and control.
- Bridge-backed cast sessions remain active until the user stops casting so
  their gateway jobs are not cancelled early.
- Cast device capabilities include HLS/MP4/MKV support, codec hints, localhost
  reachability, remote-URL requirement, and remux allowance. The desktop cast
  modal surfaces the most important format/remux hints in the device list.
- Manual advanced-source casting is allowed only after client-side preflight;
  localhost, `127.0.0.1`, IPv6 loopback, and `.localhost` playback URLs are
  rejected before the bridge cast request is sent.
- Discovery, selected-device, incompatible-source, remux, bridge, and generic
  cast failures now map to explicit refresh, fallback, or repair actions. The
  dialog also shows when session-driven fallback is trying another candidate.

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
- FFmpeg remux output is materialized into bounded MP4 cache files before
  range seeking. Remux preparation now supports timeout, explicit cancellation,
  gateway `remuxing` status, configurable FFmpeg path, cache TTL/size limits,
  health diagnostics, and gateway media capability metadata. Real large-file
  playback and seek behavior still need device validation.
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
- Build metadata should stay centralized: see
  [docs/BUILD_METADATA.md](./docs/BUILD_METADATA.md). Release pipelines should
  inject `STREAMER_APP_VERSION`, `STREAMER_GIT_SHA`,
  `STREAMER_BUILD_DATE`, `STREAMER_BUILD_CHANNEL`, and
  `STREAMER_BUILD_ENVIRONMENT`.
- Secrets/env management needs review.
- Bridge, add-on URLs, auth, cast URLs, and remote media URLs need a focused security review.
- Privacy export/delete flows should be verified end-to-end.
- Golden path tests should cover browse -> Play Best -> fallback -> download -> cast.

## Completed Roadmap Through PR #141

The detailed #106-#124 plan below is retained as implementation history. Do not
replay it. The active post-#141 work, priorities, acceptance criteria, and the
explicitly deferred real-device QA phase are maintained in
[ROADMAP.md](./ROADMAP.md).

### Phase 1: Truth Sync And Reliability

1. **PR #106: Docs truth-sync and roadmap cleanup.** Align docs with current
   code, remove stale in-review claims, clarify remux/seek behavior, document
   the manual update policy, and make the new roadmap start at #106.
2. **PR #107: Playback reliability hardening.** Harden session-first Play Best
   for direct, torrent, bridge-unavailable, timeout, no-peers, remux-required,
   fallback, and all-candidates-failed cases.
3. **PR #108: Gateway state model v2.** Make gateway/torrent/remux phases more
   explicit for UX, logging, Sentry breadcrumbs, diagnostics, and tests.
4. **PR #109: Remux runtime and cache productization.** Define FFmpeg discovery,
   cache size/TTL/location/cleanup, seekability metadata, unsupported runtime
   errors, and packaged desktop behavior.

### Phase 2: Offline, Cast, And Desktop Productization

5. **PR #110: Offline Library v2.** Turn downloads into a clear offline library
   with verified local-file badges, queue polish, storage UI, retry/delete
   rules, and honest unsupported-source handling.
6. **PR #111: Cast capabilities v2.** Add device/source preflight, capability
   explanations, fallback/remux decisions, and cast diagnostics. The client now
   blocks localhost-only manual cast URLs and shows device format/remux hints;
   real-device Chromecast/AirPlay validation remains in the QA matrix.
7. **PR #112: Desktop runtime repair flow.** Make bridge/runtime/native
   engine/FFmpeg problems understandable and repairable from Settings. Sources
   & Devices now supports runtime re-check, restart, repair steps, FFmpeg/remux
   diagnostics, remux cache status, and safe diagnostics export.

### Phase 3: Release Engineering And Security

8. **PR #113: Release automation v2.** Produce reproducible macOS release
   artifacts, draft releases, release notes, artifact validation, and explicit
   Windows status. The manual `Desktop Release` workflow now builds signed
   macOS DMG/ZIP artifacts, writes release notes, uploads artifacts, and can
   create a draft GitHub Release when Apple/GitHub secrets are configured;
   Windows remains deferred.
9. **PR #114: Security baseline v2.** Tighten bridge auth defaults, SSRF
   bypass tests, Electron boundaries, logging/Sentry redaction, and dependency
   tooling. This PR makes stream-server bridge control fail closed in
   production when `STREAMER_BRIDGE_TOKEN` is missing, keeps local development
   permissive, adds release-gate coverage for that invariant, and documents the
   bridge trust boundary.
10. **PR #115: Observability and RC evidence bundle.** Tie Sentry/release
    health, source maps, privacy-safe breadcrumbs, failure buckets, CI summary,
    QA matrix links, known issues, and release blockers together. This PR adds
    an `rc:evidence` generator, CI artifact upload, release-gate checks, and an
    explicit shared failure-bucket taxonomy for release-candidate review.

### Phase 4: Design System And UX Polish

11. **PR #116: Design system pilot v2.** Introduce constrained primitives for
    buttons, surfaces, status pills, sheets, empty/error states, focus states,
    spacing, radius, and typography without a full UI migration. This PR adds a
    shared `components/ui/designSystem.ts` token layer and applies it to the
    existing Surface, AppButton, StatusPill, SettingsSection,
    PlaybackStatusPanel, DownloadQueueCard, and desktop cast dialog pilots.
12. **PR #117: Player UX v3.** Build premium, capability-aware player controls
    and typed playback copy for finding source, peers, remux preparation,
    fallback, and terminal errors. This PR tightens `PlayerControls` with
    explicit remux/live/unknown-duration seek copy and routes button, scrubber,
    accessibility, and desktop hotkey seeking through the same guarded
    capability callbacks.
13. **PR #118: Home v2 and Continue Watching.** Improve hero, continue
    watching, provider rails, recently added, trending/popular rails, skeletons,
    empty states, and retry states. This PR gives Home a session-oriented
    hierarchy with a persistent Continue Watching row, resume/remove actions,
    clear empty progress copy, and library/discover/download shortcuts while
    keeping source complexity hidden.
14. **PR #119: Search and discovery v2.** Add unified search, recent searches,
    suggestions, filters, consistent result cards, and no-results handling.
    This PR should keep backend search unchanged unless needed; the current
    implementation centralizes `/search` and `/search/results?q=...`, adds
    type/year filtering over returned metadata, unifies desktop command palette
    and overlay recent-search storage, and keeps source/provider complexity out
    of the primary search result UI.
15. **PR #120: Settings and onboarding v2.** Make setup, Sources & Add-ons,
    Devices & Cast, Playback, Downloads, Privacy & Security, Advanced
    Diagnostics, About, version, and update information understandable. This
    PR adds a first-run setup checklist that explains source/device readiness
    without mentioning Real-Debrid, and exposes About/build/update information
    in Settings without requiring Advanced Diagnostics.

### Phase 5: Focused Extra Features

16. **PR #121: More Sources and safe debug bundle v2.** Keep advanced source
    inspection collapsed, redacted, and useful for support without making it the
    primary UX. The current implementation exposes action-specific candidate
    eligibility, user-facing candidate ranks, rejected-source reasons, and a
    safe debug bundle containing app/build, device profile, bridge, session,
    planner, and download snapshots without raw URLs, magnets, tokens, or local
    paths.
17. **PR #122: Smart Downloads.** Add opt-in next-episode, storage-limit,
    Wi-Fi-only, quality, and per-series download rules after Offline Library v2.
    Current implementation keeps automation disabled by default, stores local
    smart-download preferences and planned next-episode intents, shows those
    controls on Downloads and Settings, and only records a next-episode plan
    after a series download starts. It does not claim background downloads are
    reliable across mobile platforms yet.
18. **PR #123: Personalization and profiles light.** Add local preferences for
    quality, subtitles, audio language, autoplay, preferred providers, and watch
    history improvements. Current implementation keeps this intentionally
    local and lightweight: playback quality, subtitle language, audio language,
    and autoplay-next preferences live in `playerStore`, are exposed in
    Settings, and the Play Best planner request uses the selected quality as
    the maximum playback quality. It does not introduce account profiles,
    parental controls, or recommendation algorithms yet.
19. **PR #124: Delight features.** Add small, separately testable polish such
    as seek previews, resume prompts, ambient backdrops, PiP, keyboard shortcut
    overlay, haptics, and cast mini-controller after reliability work. Current
    implementation keeps scope small: the resume prompt can show a formatted
    `Resume from mm:ss?` position, and desktop/web player controls expose a
    keyboard shortcut helper for the shortcuts already supported by
    `usePlayerHotkeys`. Seek previews, ambient backdrops, cast mini-controller,
    and richer PiP polish remain deferred.

Do not reintroduce completed roadmap items as new standalone work:
`PlaybackSession`, Planner v2, Play Best via sessions, downloads via sessions,
cast via sessions, broad Plex/Jellyfin replacement, central transcoding farm,
or a full Tamagui migration.

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
- Use `evaluateActionPreflight` for action eligibility. Preflight may inspect a
  supplied snapshot, but it must never start or probe a bridge, resolve media,
  create a gateway job, or persist a source. Keep those effects in the action
  orchestrator or engine after a ready result.
- Prefer user-facing states over raw alerts for playback/download/cast failures.
- Do not replace the architecture with Plex/Jellyfin-style library hosting;
  that does not fit the add-on aggregation and dynamic playback-planning goal.
- Do not persist or log resolved source URLs, magnets, info hashes, bridge
  tokens, signed gateway URLs, local file URIs, or bridge URLs.
- Do not bypass the add-on source safety policy for manifest, catalog, meta,
  stream, or search fetches.
- Do not make manual source selection the primary detail-page UX again.
- Do not show offline completion unless a local file has been verified.
- Do not make Real-Debrid part of onboarding or default playback.
- Do not introduce XState unless the existing reducer/service lifecycle is no
  longer understandable or testable.
- Do not introduce a full Tamagui migration in one PR; pilot primitives first.
- Do not make the API server own the desktop bridge by default.

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
