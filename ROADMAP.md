# Streamer Roadmap

Last updated: 2026-07-14.

This is the current source of truth for work after PR #141. The architecture
does not need another control-plane rewrite. The next phase is to reduce
security and release risk, make the existing click-and-play paths easier to
prove automatically, and continue product polish without claiming real-device
support before it has been tested.

## Product Direction

Streamer should behave like a mainstream streaming app:

- The normal flow is browse -> title -> Play or Resume.
- Planner and playback sessions choose and fall back between sources.
- Source selection remains an advanced recovery and diagnostics surface.
- Downloads are called offline-ready only after a managed local file is
  verified.
- Cast and torrent actions preflight device and bridge reachability before
  promising they will work.
- Real-Debrid remains optional, disabled by default, and absent from first-run
  onboarding.

Keep the current macro architecture:

- Expo/React Native client for iOS, Android, web, and the desktop renderer.
- Hono API server for auth, metadata, add-ons, planning, library, and sync.
- Shared playback contracts in `packages/shared`.
- Local stream-server for torrent, gateway, remux, cast, health, and cache
  behavior.
- Electron shell for desktop packaging and sidecar ownership.

Do not replace this with Plex/Jellyfin, a central transcode farm, a new
playback-session architecture, or a full UI-framework migration.

## Current State

Implemented through PR #151:

- PlaybackSession, Planner v2, Play Best, downloads, and cast share the
  session-first control plane.
- Direct, torrent, remux, no-peers, stalled, bridge-unavailable, and terminal
  fallback states are typed.
- Gateway readiness waits for remux output or readable first bytes instead of
  reporting false readiness.
- Torrent and remux caches have explicit locations, TTL and size limits,
  cleanup, diagnostics, and protected manual cleanup.
- Source audio language participates in ranking and available runtime audio or
  subtitle tracks can be selected in the player.
- Native devices are warned when a loopback bridge URL cannot reach the
  desktop bridge.
- Desktop packaging, signing configuration, Sentry metadata, release evidence,
  and security baselines exist.
- Production high/critical dependency findings block CI, and install scripts
  are constrained by a reviewed allowlist.
- Deterministic phone-web and desktop-renderer golden paths cover Play Best,
  fallback, terminal no-peers, bridge guidance, download, and cast eligibility.
- Play, Download, Cast, Settings, and planner readiness use one shared action
  preflight contract for bridge URL scope, device reachability, auth, gateway,
  torrent, remux, and cast capabilities.
- Mobile development, preview, and production builds have stable native
  identifiers, validated dynamic Expo configuration, explicit EAS environments
  and update channels, and credential-free CI smoke coverage.
- Production server startup validates secrets, origins, topology, Redis and
  SMTP expectations; rate limiting has explicit single/multi-instance failure
  behavior and liveness is separate from dependency readiness.
- Offline and cast failures have typed, privacy-safe recovery guidance. A
  failed download offers one context-specific retry, replan, verify, storage,
  bridge-repair, or remove action, while cast discovery/source/device failures
  offer refresh, fallback, or bridge repair without retrying loopback URLs.
- The current unreleased UI redesign introduces a semantic dark-cinematic
  palette with preserved light mode, compact/medium/expanded/large window
  classes, four primary destinations, deduplicated Home composition, unified
  Search/discovery state, recoverable removal actions, and PiP/background/cast
  continuity foundations.

Not yet proven:

- Real-device playback, seek, download, and cast behavior remains unvalidated
  on the full target matrix.
- Large-file torrent and remux behavior has code coverage but not release
  evidence.
- macOS signing/notarization and mobile store builds have not been demonstrated
  with production credentials.
- The app must not be described as production-ready until the QA matrix and RC
  checklist contain real evidence.

## Evidence From The Current Repository

The next priorities are based on observed gaps, not old roadmap numbering:

- Remaining moderate dependency exceptions are documented and time-bounded;
  newly introduced high or critical production findings block CI.
- Mobile identity/configuration is deterministic, while real EAS preview and
  store builds still require project credentials and recorded device evidence.
- CI now proves deterministic renderer flows, while native and packaged target
  behavior remains intentionally unproven until real-device QA is recorded.
- Bridge reachability rules have been improved incrementally and should be
  centralized so Play, Download, Cast, Settings, and diagnostics cannot drift.
- Real-device QA is intentionally deferred for now; work below must preserve
  `unknown` target status until that evidence exists.

## Active Roadmap

### In Progress: Adaptive Cinematic UI/UX Redesign

Goal: complete the consumer-first redesign without changing the playback
control plane or exposing source complexity as the default experience.

Implemented in the current draft phase:

- Semantic theme, focus, overlay, disabled, and contrast tokens.
- Compact bottom navigation and medium/expanded/large rail/sidebar behavior.
- Stable Home hero/rail composition with canonical deduplication and honest
  released-date labeling.
- One Search/discovery destination with URL-restorable type/year/sort state and
  a responsive advanced-filter surface.
- Search provenance returned by the server, canonical `type:id` deduplication,
  and a URL-restorable provider facet.
- Undo for Library and Continue Watching removal.
- PiP/background configuration, accessible player status announcements, and a
  cast session that survives route navigation with synchronized status,
  progress, pause/play, and seek controls.
- Detail, Library, auth, onboarding, player sheets, and core media controls now
  consume semantic tokens and the shared window-class contract; active audio
  and subtitle choices are visible in the player controls.
- Provider rails exclude titles already claimed by the hero, Continue Watching,
  and primary Home rails.

Remaining before this redesign milestone is complete:

- Finish the long-tail Settings and diagnostics token migration and validate
  Downloads at large text and all supported window classes.
- Add genre/language/availability facets only when providers return reliable
  metadata for those fields; do not infer them from labels.
- Add recoverable bulk/download actions where the underlying file operation is
  reversible; retain confirmation where it is not.
- Finish media accessibility for subtitle visibility, caption-safe layout,
  alternate/audio-description labeling, large text, and focus-not-obscured.
- Add authenticated browser golden paths and record native PiP, lock-screen,
  download, and Chromecast evidence without converting unknowns into claims.

Acceptance:

- Core consumer flows share one token and window-class contract.
- Search/back state and Home rail identity remain stable and test-covered.
- Player features do not regress below platform-standard media expectations.
- Automated checks and responsive screenshots cover authenticated primary
  states; native claims remain gated by real-device evidence.

### Completed: PR #143 - Dependency Security Remediation And Blocking Audit Gate

Goal: remove known high/critical production dependency risk and make regression
visible in CI.

Scope:

- Upgrade or safely override vulnerable direct and transitive dependencies.
- Treat Hono, Nodemailer, WebSocket, protobuf/cast, Sentry/OpenTelemetry, and
  build-chain findings according to actual runtime exposure.
- Avoid blind `npm audit fix --force`; document unavoidable exceptions with an
  owner, reason, and expiry/review condition.
- Replace the non-blocking high/critical audit with an enforceable policy.
- Keep native WebTorrent and Electron architecture compatibility covered.

Acceptance:

- No unexplained high or critical production finding remains.
- The security job fails for a newly introduced unapproved high/critical
  finding.
- Typecheck, tests, desktop package checks, and release gate stay green.

### Completed: PR #144 - Deterministic Golden-Path Browser And Desktop Harness

Goal: catch product-flow regressions without waiting for physical-device QA.

Scope:

- Add deterministic fixtures for auth, catalog, detail, planner, direct
  playback readiness, bridge unavailable, no peers, fallback, download
  eligibility, and cast eligibility.
- Add browser smoke tests for browse -> detail -> Play Best and terminal error
  recovery.
- Add a packaged/desktop-renderer smoke path where practical without native
  torrent network traffic.
- Keep fixtures free of copyrighted media discovery and sensitive URLs.

Acceptance:

- CI exercises the primary click-and-play UI with deterministic data.
- A planner `400`, infinite buffering regression, or loopback eligibility drift
  fails the suite.
- These tests are described as automated regression coverage, not real-device
  evidence.

### Completed: PR #145 - Unified Action And Bridge Preflight Contract

Goal: make Play, Download, Cast, Settings, and diagnostics answer readiness in
the same way.

Scope:

- Add a shared, side-effect-light preflight result with typed reason codes.
- Centralize bridge availability, runtime support, configured URL, loopback,
  LAN reachability, auth, gateway, torrent engine, and remux capability checks.
- Remove duplicated platform-specific conditionals from action surfaces.
- Keep direct/HLS playback available when torrent support is unavailable.

Acceptance:

- Identical device/bridge input produces consistent Play, Download, and Cast
  eligibility.
- Preflight does not start a bridge, resolve media, or create a gateway job.
- User-facing copy maps typed reasons without exposing raw URLs or tokens.

### Completed: PR #146 - Mobile Release Identity And EAS Baseline

Goal: make preview and production mobile builds reproducible without claiming
store readiness.

Scope:

- Replace generic app identity with stable slug, scheme, iOS bundle identifier,
  and Android package identifier.
- Move environment-specific API, Sentry, build channel, and update values into
  validated app configuration.
- Define development, preview, and production EAS profiles and version policy.
- Add credential-free config validation and build-config smoke checks to CI.
- Document required Expo, Apple, Google, and Sentry secrets without committing
  them.

Acceptance:

- Expo config resolves deterministic identifiers for every profile.
- Placeholder Sentry organization/project values cannot enter production.
- A preview build can be started from documented commands once credentials are
  supplied.

### Completed: PR #147 - Server Production Runtime Hardening

Goal: turn the API server configuration into a safer single- or multi-instance
production baseline.

Scope:

- Validate required production environment variables at startup.
- Replace or explicitly gate the in-memory rate limiter for multi-instance
  deployment, using the existing Redis direction where appropriate.
- Separate liveness and dependency readiness where needed.
- Document reverse-proxy, trusted-origin, database, Redis, mail, and shutdown
  expectations.
- Add tests for fail-closed production defaults.

Acceptance:

- Invalid production configuration fails before accepting requests.
- Rate-limit behavior is explicit for one and multiple instances.
- Health output is useful without leaking secrets or internal URLs.

### Completed: PR #148 - Offline And Cast Recovery UX

Goal: improve the two major secondary actions with typed, recoverable states
that can be tested without real devices.

Scope:

- Consolidate retry, replan, cancellation, storage-pressure, missing-file, and
  bridge-repair actions for downloads.
- Consolidate unreachable-device, incompatible-source, remux-required, and
  fallback states for cast.
- Reuse the shared preflight contract from PR #145.
- Do not add background-download or native-cast support claims.

Acceptance:

- Every non-success state has one clear next action.
- Offline-ready still requires a verified managed file.
- Cast never sends a loopback-only source to a remote device.

### Completed: PR #149 - Dev Runtime Architecture Guard

Goal: make local stream-server startup deterministic across native and Rosetta
Node installations.

Scope:

- Select a supported Node 24 runtime matching installed native dependencies.
- Detect mixed esbuild/node-datachannel architectures before startup.
- Provide an explicit native dependency repair command.
- Make the shared workspace ESM boundary work under the stream-server runtime.
- Cover runtime selection and shared named imports in CI.

Acceptance:

- An x64 Node 25 parent can launch a healthy arm64 Node 24 bridge.
- The torrent engine reports ready after a matching install.
- Architecture mismatch failures provide a concrete repair command.

### Completed: PR #150 - Accessibility And Responsive Visual Quality Pass

Goal: make the existing pastel cinema UI more consistent and usable without a
framework rewrite.

Scope:

- Audit Home, Discover, Detail, Player, Downloads, Search, Settings, and
  onboarding for focus order, keyboard use, labels, contrast, touch targets,
  overflow, and reduced-motion behavior.
- Consolidate remaining one-off spacing, surface, button, status, empty, and
  error styles into the existing design-system primitives.
- Add desktop and phone-width browser screenshots for stable primary states.
- Preserve provider rails and keep More Sources collapsed.

Acceptance:

- Primary flows have no known overlap at supported responsive widths.
- Keyboard and screen-reader labels cover primary controls.
- Screenshot changes are intentional and reviewable.

### Completed: PR #151 - Consistent Dev Runtime Entry Points

Goal: prevent API, Expo, web, and desktop development commands from bypassing
the Node/native architecture guard used by the bridge.

Scope:

- Run root API, Expo, Expo web, and desktop commands with the selected Node 24
  runtime.
- Keep workspace scripts unchanged for CI and package builds.
- Reuse graceful listener cleanup for the API port.
- Add parser and failure-path coverage to the existing runtime tests.

Acceptance:

- Root dev entrypoints no longer inherit an incompatible Node 25/Rosetta
  runtime.
- Direct workspace scripts remain available to CI.
- Runtime selection logic remains covered by the stream-server CI job.

### Deferred Milestone - RC Evidence And Real-Target QA Resume

Goal: perform the work that is intentionally deferred now and make a real
go/no-go release decision.

Scope:

- Run the QA matrix on packaged macOS, browser web, iPhone, and Android.
- Validate direct, fallback, torrent peers/no-peers, remux, seek, downloads,
  cast, bridge repair, cache cleanup, and restart behavior.
- Run signed/notarized desktop and mobile preview workflows with production-like
  credentials.
- Record screenshots, logs, known issues, and release blockers.

Acceptance:

- Support claims match recorded evidence.
- RC checklist has no silent unknowns.
- Release decision is evidence-based.

This PR remains deferred until the user can provide or access the required
devices and credentials. Earlier PRs must not mark it complete on the strength
of mocks or unit tests.

## Execution Order

1. Completed: PR #143 - dependency security and audit enforcement.
2. Completed: PR #144 - deterministic golden-path automation.
3. Completed: PR #145 - unified action/bridge preflight.
4. Completed: PR #146 - mobile release identity and EAS baseline.
5. Completed: PR #147 - server production runtime hardening.
6. Completed: PR #148 - offline and cast recovery UX.
7. Completed: PR #149 - dev runtime architecture guard.
8. Completed: PR #150 - accessibility and responsive visual quality.
9. Completed: PR #151 - consistent dev runtime entrypoints.
10. In progress - adaptive cinematic UI/UX redesign.
11. Deferred milestone - real-target QA and RC evidence when available.

Dependency enforcement, deterministic renderer automation, shared action
preflight, mobile release configuration, server production hardening, and
offline/cast recovery UX, and the accessibility/responsive visual-quality pass
are complete. Real-target QA and RC evidence remain intentionally deferred
pending real targets and release credentials. Future action surfaces must reuse
the shared preflight and recovery contracts instead of adding local
bridge-readiness conditionals.

## Working Rules

- Use small PRs from updated `master` with `codex/<task-name>` branches.
- Do not persist or log raw media URLs, magnets, info hashes, bridge tokens,
  signed gateway URLs, or local file paths.
- Do not expose source selection as the default experience.
- Do not call a download offline-ready without local-file verification.
- Do not add Real-Debrid to onboarding or enable it by default.
- Do not use mocks or unit tests to claim real-device support.
- Keep [docs/QA_MATRIX.md](./docs/QA_MATRIX.md) and
  [docs/RC_CHECKLIST.md](./docs/RC_CHECKLIST.md) conservative until real-target
  QA resumes.
