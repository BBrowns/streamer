# ADR-0003: Put Platform Playback Behind Media-Player Adapters

- Status: Accepted
- Date: 2026-08-01

## Context

Expo Video, browser video and the Electron renderer expose different track,
volume, fullscreen, picture-in-picture, thumbnail and source-replacement
behavior. Scattered platform checks made those differences implicit and could
advertise unsupported functions.

## Decision

Use the platform-neutral `MediaPlayerAdapter` port with separate native Expo,
web and Electron implementations. Select the implementation at the player
composition boundary. The UI consumes adapter capabilities and the Planner
route rather than assuming parity across targets.

Fullscreen and picture-in-picture act only on the media surface owned by the
current player instance. Unsupported functions fail closed.

## Consequences

- Accepted time, status, seek, tracks, volume, thumbnails and source
  replacement have one application-facing vocabulary.
- Web and Electron do not claim Expo-native track selection.
- Native/system-volume behavior does not expose a fake player-volume control.
- Real iOS, Android, browser and packaged Electron QA remains necessary before
  product support claims.
