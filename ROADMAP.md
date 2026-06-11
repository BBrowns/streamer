# Streamer Roadmap

Last updated: 2026-06-11.

This roadmap is the current source of truth for moving Streamer from a mostly
complete playback architecture to a production-ready streaming application.

## Product Direction

Streamer should behave like a mainstream streaming app: users browse content,
press one primary action, and the app plans playback, downloads, and casting
without exposing source mechanics by default.

The current architecture remains the right basis:

- Expo/React Native client for iOS, Android, web, and desktop renderer.
- Hono API server for auth, metadata, add-ons, stream planning, library, and sync.
- Shared playback contracts in `packages/shared`.
- Local `stream-server` bridge for torrent, gateway, remux, cast, health, and
  handoff behavior.
- Electron shell for desktop packaging and bridge sidecar startup.

Do not rewrite this into Plex/Jellyfin, a central transcode farm, or a new
playback-session architecture.

## Current Status

The playback control plane is in place:

- `PlaybackSession` exists for Play, Download, and Cast.
- Planner v2 ranks candidates and exposes rejection reasons.
- Play Best, downloads, and cast run through sessions.
- Gateway range handling and signed stream URLs exist.
- Bridge runtime diagnostics and native-module mismatch reporting exist.
- Remuxed MKV output can be materialized to temporary MP4 and served with byte
  ranges.
- Download resume now replans safely without persisting raw stream URLs or
  `Stream` objects.

The app is still not production-ready because the remaining risk is real target
validation, release packaging, observability, and final product UX.

## Recent PR State

| PR  | Area                              | Status                   | Remaining risk                                                                   |
| --- | --------------------------------- | ------------------------ | -------------------------------------------------------------------------------- |
| #87 | Bridge runtime repair diagnostics | Implemented              | Needs packaged macOS verification and a clearer user-facing repair flow.         |
| #88 | Seekable remux output             | Implemented and hardened | Needs real large-file playback/seek QA and FFmpeg packaging/licensing decisions. |
| #89 | Real-device QA matrix             | Infrastructure only      | Real iPhone, Android, desktop package, and browser runs are not complete.        |
| #90 | Download resume replan            | Implemented and hardened | Needs large-file/device QA and UX copy review for restart edge cases.            |

## Validation Policy

Do not claim a target is supported until it has a recorded run in
[docs/QA_MATRIX.md](./docs/QA_MATRIX.md).

Every release candidate must record:

- environment and build identifier
- device/runtime
- fixture/source type
- first-frame behavior
- seek behavior
- fallback behavior
- cancellation behavior
- cleanup behavior
- logs or screenshots when a failure occurs

Local unit tests are useful regression coverage, but they are not a substitute
for real-device QA.

## Next PRs

### PR #91 - Cast and AirPlay Capability Validation

Goal: prove cast flows on real devices.

Scope:

- Chromecast discovery/start/stop/fallback on real hardware.
- iOS AirPlay path review through native player behavior.
- Device capability labels in player/detail where available.
- Regression tests for configured bridge URL usage and cast fallback.

Acceptance:

- Cast MP4/HLS/gateway source behavior is recorded in the QA matrix.
- Unsupported device/source combinations fail with clear user copy.
- No hard-coded localhost cast behavior returns.

### PR #92 - Security Hardening Round Two

Goal: tighten release trust boundaries.

Scope:

- Electron IPC and navigation restrictions.
- CORS/media delivery checks for bridge and cast paths.
- Add-on redirect/private-network bypass tests.
- Production defaults audit.
- Logging/telemetry redaction checks for URLs, magnets, tokens, info hashes, and
  local paths.

Acceptance:

- Security checks fail CI for unsafe defaults.
- Exceptions are explicit and documented.

### PR #93 - Sentry Releases and Source Maps

Goal: make production errors debuggable without leaking sensitive media data.

Scope:

- Shared release/build metadata.
- Sentry release names and source-map upload.
- Privacy-safe breadcrumbs for playback, fallback, gateway, downloads, and cast.
- Redaction tests.

Acceptance:

- Stack traces are readable for mobile/server/desktop where source maps are
  available.
- Events do not contain raw media URLs, magnets, tokens, info hashes, or personal
  local paths.

### PR #94 - Golden-Path E2E and Screenshot QA

Goal: make the click-and-play path continuously verifiable.

Scope:

- Browse -> detail -> Play Best direct source.
- Browse -> detail -> Play Best fallback source.
- Torrent peers/no-peers paths.
- Download direct/torrent paths.
- Cast direct/gateway paths.
- Desktop and phone screenshots.

Acceptance:

- CI or release workflow produces readable artifacts.
- Known limitations are documented instead of implied as supported.

## Later Work

- Desktop signing, notarization, release artifacts, and update strategy.
- Mobile EAS Build/Submit automation.
- Privacy export/delete end-to-end verification.
- Home/Discover/Detail/Player polish toward a premium streaming UX.
- Settings and Sources & Devices v2 with normal-user language and advanced
  diagnostics hidden behind disclosure.

## Rules For Future Agents

- Do not expose source picking as the primary UX.
- Do not persist resolved stream URLs, raw magnets, info hashes, or full `Stream`
  objects.
- Do not claim torrent/remux reliability without recorded real-device validation.
- Do not combine architecture rewrites with UX polish.
- Do not ship desktop without a documented packaging, signing, and update path.
