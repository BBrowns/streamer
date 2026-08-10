# ADR-0002: Separate The Control Plane From The Media Plane

- Status: Accepted
- Date: 2026-08-01

## Context

User intent, planning, fallback and persistence have different security and
lifecycle requirements from torrents, byte ranges, FFmpeg, caching and native
media playback. Mixing both sets of concerns in screens or IPC handlers makes
cancellation, privacy and replacement difficult to reason about.

## Decision

Treat `server`, shared playback contracts and the mobile playback-session core
as the control plane. Treat source adapters, media-player adapters and
`packages/stream-server` as media-plane implementations. The control plane may
select and coordinate a media route through typed ports but must not persist or
spread media implementation details.

`PlaybackSession` remains the sole persisted playback authority. No second
persisted player state machine is introduced.

## Consequences

- Sessions persist opaque candidate/attempt state and sanitized errors, never
  raw streams, magnets, hashes, bridge URLs, credentials or signed media URLs.
- Screens compose presentation and bind application services; they do not own
  torrent or FFmpeg jobs.
- Media implementations can change behind stable route, preparation and bridge
  contracts.
- Some legacy compatibility remains isolated until target evidence permits its
  removal.
