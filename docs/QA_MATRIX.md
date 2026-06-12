# Playback QA Matrix

Last updated: 2026-06-12.

This matrix tracks real target validation for Streamer playback, downloads,
casting, bridge health, and remux behavior. A target is not considered supported
until a run is recorded here or linked from `docs/qa-runs/`.

CI release gates are documented in [CI_RELEASE_GATES.md](./CI_RELEASE_GATES.md).
Release candidate validation is tracked with
[RC_CHECKLIST.md](./RC_CHECKLIST.md).

Current project phase: architecture complete enough; reliability,
productization, real-device QA, and release evidence are still open. This
matrix is intentionally conservative and should not be backfilled from unit
tests alone.

## Status Legend

| Status  | Meaning                                             |
| ------- | --------------------------------------------------- |
| Pass    | Validated on the named target and build.            |
| Partial | Works with documented limitations.                  |
| Fail    | Reproduced failure. Must link logs or notes.        |
| Blocked | Could not run because setup/runtime is unavailable. |
| Unknown | Not run yet. No support claim should be made.       |

## Current Target Status

| Runtime                    | Current status | Evidence                                                                        |
| -------------------------- | -------------- | ------------------------------------------------------------------------------- |
| macOS desktop packaged app | Unknown        | No packaged-app run recorded yet.                                               |
| Electron/web dev runtime   | Partial        | Local regression tests only; see `docs/qa-runs/2026-06-11-local-regression.md`. |
| iPhone physical device     | Unknown        | No run recorded yet.                                                            |
| Android physical device    | Unknown        | No run recorded yet.                                                            |
| Browser web                | Unknown        | No browser playback run recorded yet.                                           |

## Reference Fixtures

| ID  | Source shape                 | Purpose                | Required observations                                             |
| --- | ---------------------------- | ---------------------- | ----------------------------------------------------------------- |
| F1  | Direct MP4, H.264/AAC        | Baseline click-to-play | first frame, seek, stop cleanup                                   |
| F2  | HLS, H.264/AAC               | Streaming-only source  | first frame, no offline-complete claim                            |
| F3  | Torrent MKV, H.264/AC3       | Remux path             | peers, remuxing state, first frame, seek after remux              |
| F4  | Torrent MKV, HEVC/EAC3       | Codec edge             | rejection/fallback or remux readiness                             |
| F5  | Direct MP4, AV1/AAC          | Device codec edge      | compatible target succeeds; incompatible target rejects/fallbacks |
| F6  | Torrent 4K MKV               | Large-file behavior    | remux timeout/cancel/progress, storage impact                     |
| F7  | Torrent episode pack         | file selection         | correct episode selected from season/episode hints                |
| F8  | Broken direct/torrent source | fallback               | terminal error or automatic fallback, no infinite buffering       |

## Golden Path Matrix

| Flow                                               | Desktop packaged | Electron/web dev               | iPhone  | Android | Browser web |
| -------------------------------------------------- | ---------------- | ------------------------------ | ------- | ------- | ----------- |
| Browse -> detail -> Play Best direct source        | Unknown          | Unknown                        | Unknown | Unknown | Unknown     |
| Play Best fallback source                          | Unknown          | Unknown                        | Unknown | Unknown | Unknown     |
| Torrent with peers -> gateway ready -> first frame | Unknown          | Unknown                        | Unknown | Unknown | Unknown     |
| Torrent no peers -> terminal no-peers/error        | Unknown          | Unknown                        | Unknown | Unknown | Unknown     |
| Remux source -> remuxing -> first frame            | Unknown          | Partial: unit/integration only | Unknown | Unknown | Unknown     |
| Direct stream seek forward/back                    | Unknown          | Partial: unit/integration only | Unknown | Unknown | Unknown     |
| Remuxed stream seek after materialization          | Unknown          | Partial: unit/integration only | Unknown | Unknown | Unknown     |
| Download direct source                             | Unknown          | Partial: unit tests only       | Unknown | Unknown | Unknown     |
| Download torrent source                            | Unknown          | Partial: unit tests only       | Unknown | Unknown | Unknown     |
| Cast HLS/MP4 source                                | Unknown          | Unknown                        | Unknown | Unknown | Unknown     |
| Bridge unavailable/unsupported                     | Unknown          | Partial: unit tests only       | Unknown | Unknown | Unknown     |
| Desktop bridge diagnostics/repair                  | Unknown          | Partial: unit tests only       | Unknown | Unknown | Unknown     |

## Release Blockers

- Record at least one packaged macOS desktop run.
- Record at least one physical iPhone run.
- Record at least one physical Android run.
- Record one browser-web run.
- Record one real Chromecast or explicitly mark casting as unsupported for the
  release candidate.
- Attach logs/screenshots for every Fail or Partial result.

## Run Record Template

Create a file under `docs/qa-runs/YYYY-MM-DD-target.md`.

```md
# QA Run: target name

- Date:
- Tester:
- Build/version/git sha:
- Runtime:
- Device/OS:
- Network:
- Bridge URL/owner:
- Add-ons:

## Results

| Flow             | Fixture | Status  | Notes |
| ---------------- | ------- | ------- | ----- |
| Play Best direct | F1      | Unknown |       |

## Evidence

- Logs:
- Screenshots/video:
- Known limitations:
```
