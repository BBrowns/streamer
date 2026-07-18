# Playback QA Matrix

Last updated: 2026-07-18.

This matrix tracks real target validation for Streamer playback, downloads,
casting, bridge health, and remux behavior. A target is not considered supported
until a run is recorded here or linked from `docs/qa-runs/`.

CI release gates are documented in [CI_RELEASE_GATES.md](./CI_RELEASE_GATES.md).
Release candidate validation is tracked with
[RC_CHECKLIST.md](./RC_CHECKLIST.md).
Automated renderer regression coverage is documented in
[AUTOMATED_GOLDEN_PATHS.md](./AUTOMATED_GOLDEN_PATHS.md). It does not change the
`Unknown` status of native or packaged targets below.

Current project phase: architecture complete enough; reliability,
productization, real-device QA, and release evidence are still open. This
matrix is intentionally conservative and should not be backfilled from unit
tests alone.

## Status Legend

| Status  | Meaning                                                         |
| ------- | --------------------------------------------------------------- |
| Pass    | Validated on the named target and build.                        |
| Partial | A bounded subset passed; documented limitations remain.         |
| Fail    | Reproduced failure. Must link logs or notes.                    |
| Blocked | Attempted, but required setup/runtime was unavailable.          |
| Not run | Explicitly omitted from this run; no target claim is permitted. |
| Unknown | No target-specific run has been recorded yet.                   |

## Current Target Status

| Runtime                    | Current status | Evidence                                                                                                                                                                                                                                                                                                         |
| -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS desktop packaged app | Unknown        | No packaged-app run recorded yet.                                                                                                                                                                                                                                                                                |
| Electron/web dev runtime   | Partial        | Real main/preload smoke passed for build labels, `inspectFile`, and 125%/150% zoom; no packaged playback claim. See the [July 15 run](./qa-runs/2026-07-15-adaptive-correctness.md).                                                                                                                             |
| iOS Simulator              | Blocked        | Read-only preflight sees the iPhoneSimulator SDK plus iOS 17.2/26.2 runtimes, but no matching iPhone 15 runtime for SDK 26.5 and no generated Expo `ios/` project to prove deployment compatibility. See the [July 18 preflight](./qa-runs/2026-07-18-native-evidence-preflight.md).                             |
| iPhone physical device     | Unknown        | No run recorded yet.                                                                                                                                                                                                                                                                                             |
| Android physical/emulator  | Not run        | SDK/tool files exist, but the configured Detox AVD is absent. The read-only preflight deliberately does not start `adb` or an emulator; browser emulation is not native evidence. See the [July 18 preflight](./qa-runs/2026-07-18-native-evidence-preflight.md).                                                |
| Browser web                | Partial        | Deterministic responsive renderer and recovery flows passed. Reviewed Darwin and Linux Home/Settings/Search baselines now pass in CI; no real-source first-frame claim. See the [July 15 run](./qa-runs/2026-07-15-adaptive-correctness.md) and [July 18 visual run](./qa-runs/2026-07-18-visual-regression.md). |

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

| Flow                                               | Desktop packaged | Electron/web dev               | iPhone  | Android | Browser web                    |
| -------------------------------------------------- | ---------------- | ------------------------------ | ------- | ------- | ------------------------------ |
| Browse -> detail -> Play direct source             | Unknown          | Partial: deterministic UI only | Unknown | Not run | Partial: deterministic UI only |
| Play fallback source                               | Unknown          | Partial: deterministic UI only | Unknown | Not run | Partial: deterministic UI only |
| Torrent with peers -> gateway ready -> first frame | Unknown          | Unknown                        | Unknown | Not run | Unknown                        |
| Torrent no peers -> terminal no-peers/error        | Unknown          | Partial: deterministic UI only | Unknown | Not run | Partial: deterministic UI only |
| Remux source -> remuxing -> first frame            | Unknown          | Partial: unit/integration only | Unknown | Not run | Unknown                        |
| Direct stream seek forward/back                    | Unknown          | Partial: unit/integration only | Unknown | Not run | Unknown                        |
| Remuxed stream seek after materialization          | Unknown          | Partial: unit/integration only | Unknown | Not run | Unknown                        |
| Download direct source                             | Unknown          | Partial: unit tests only       | Unknown | Not run | Unknown                        |
| Download torrent source                            | Unknown          | Partial: unit tests only       | Unknown | Not run | Unknown                        |
| Cast HLS/MP4 source                                | Unknown          | Partial: planner UI only       | Unknown | Not run | Unknown                        |
| Bridge unavailable/unsupported                     | Unknown          | Partial: tests and UI smoke    | Unknown | Not run | Partial: deterministic UI only |
| Desktop bridge diagnostics/repair                  | Unknown          | Partial: unit tests only       | Unknown | Not run | Unknown                        |
| Torrent cache bounded storage/cleanup              | Unknown          | Partial: unit tests only       | Unknown | Not run | Unknown                        |

## Storage And Cache Guardrails

The stream-server now configures WebTorrent with an explicit Streamer-owned
cache directory instead of the legacy library default `/private/tmp/webtorrent`
path. Unit tests cover stale-entry cleanup, size-cap eviction, active torrent
protection, diagnostics, and the configured WebTorrent `add(..., { path })`
cache path.

Real-device QA still needs to record storage behavior during long torrent,
remux, cancellation, and app-restart runs. Until those runs exist, bounded
cache behavior should be treated as code-covered but not yet release-validated
on physical targets.

## Release Blockers

- Record at least one packaged macOS desktop run.
- Record at least one physical iPhone run.
- Record at least one physical Android run.
- Record one real-source browser-web playback run; deterministic renderer
  coverage alone does not prove first frame or seeking.
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

| Flow        | Fixture | Status  | Notes |
| ----------- | ------- | ------- | ----- |
| Play direct | F1      | Unknown |       |

## Evidence

- Logs:
- Screenshots/video:
- Known limitations:
```
