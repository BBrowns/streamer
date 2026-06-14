# Streamer Roadmap

Last updated: 2026-06-14.

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
- Gateway jobs avoid false-ready states by waiting for remux cache readiness or
  first-byte readability before handing a source to the player.
- Download resume now replans safely without persisting raw stream URLs or
  `Stream` objects.
- Planner output exposes detected source audio language metadata, and the
  player can use available `expo-video` audio/subtitle tracks once media loads.

The app is still not production-ready because the remaining risk is real target
validation, real-world torrent/bridge reliability evidence, and final product
UX polish.

## Recent PR State

| PR        | Area                            | Status      | Remaining risk                                                          |
| --------- | ------------------------------- | ----------- | ----------------------------------------------------------------------- |
| #106-#124 | Master roadmap v3               | Implemented | Real-device QA and release-candidate evidence are still incomplete.     |
| #125      | UI overlap and source ranking   | Implemented | Needs visual QA on real desktop/mobile sizes.                           |
| #126      | Remux readiness before playback | Implemented | Needs large-file remux QA with real bridge jobs.                        |
| #127      | Torrent first-byte readiness    | Implemented | Needs real torrent peer/no-peer validation across desktop and mobile.   |
| #128      | Language and track selection    | Implemented | Track availability depends on runtime/source support from `expo-video`. |

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

## Next Follow-Up PRs

The #106-#124 roadmap is complete. Future PRs should be selected from real
remaining risk, not by replaying the old roadmap.

### PR #129 - Bridge Playback Self-Test And Diagnostics

Goal: make "bridge is running but playback never starts" diagnosable without
guessing.

Scope:

- Add a safe bridge self-test that reports runtime, native engine, gateway job,
  remux, and first-byte readiness separately.
- Surface the result in Sources & Devices under normal-user copy with advanced
  details hidden behind disclosure.
- Keep direct/HLS playback unaffected when torrent support is unavailable.

Acceptance:

- Bridge ready cannot hide an engine, remux, or first-byte failure.
- User-facing copy says what action to take.
- Tests cover unavailable engine, no peers/stalled, and first-byte timeout.

### PR #130 - Real-Target QA Evidence Pass

Goal: record evidence for the click-and-play paths before making support
claims.

Scope:

- Run and document desktop packaged, browser web, iPhone, and Android paths in
  `docs/QA_MATRIX.md`.
- Capture direct source, torrent with peers, no peers, remux readiness, direct
  seek, downloads, cast, and bridge unavailable behavior.

Acceptance:

- Supported/unsupported/unknown is explicit per runtime.
- Failures include logs or screenshots.
- Product claims match recorded evidence.

### PR #131 - UX Polish From Recorded QA

Goal: address visual and interaction issues discovered during QA without
changing playback architecture.

Scope:

- Fix layout overlap, unreadable states, confusing copy, and missing empty/error
  states found in screenshots.
- Keep source complexity hidden behind advanced surfaces.

Acceptance:

- Desktop and phone screenshots show no overlap in primary flows.
- Player, Downloads, Home, Detail, and Settings remain responsive.

## Later Work

- Mobile EAS Build/Submit automation.
- Privacy export/delete end-to-end verification.
- Additional desktop signing/notarization hardening if the current release
  workflow needs production secrets or platform-specific fixes.

## Rules For Future Agents

- Do not expose source picking as the primary UX.
- Do not persist resolved stream URLs, raw magnets, info hashes, or full `Stream`
  objects.
- Do not claim torrent/remux reliability without recorded real-device validation.
- Do not combine architecture rewrites with UX polish.
- Do not ship desktop without a documented packaging, signing, and update path.
