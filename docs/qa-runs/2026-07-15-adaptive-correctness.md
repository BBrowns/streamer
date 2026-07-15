# Adaptive UX Correctness QA - 2026-07-15

- Date: 2026-07-15
- Tester: Codex automated/local validation
- Baseline git SHA: `6193756` plus the uncommitted correctness pass
- Host: macOS arm64
- Node/npm: 24.18.0 / 11.16.0
- Playwright: 1.61.1
- Electron: 40.10.6
- Xcode: 26.6 (`17F113`)

## Results

| Target                       | Status  | Evidence                                                                                                                                                   |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive Expo web renderer | Pass    | All four browser projects completed: 80 passed, 12 intentional project-aware skips, 0 failed.                                                              |
| Electron development shell   | Pass    | Real Electron main/preload/IPC smoke passed for labeled build data, exact managed-file inspection, and 125%/150% zoom without horizontal overflow.         |
| iOS disposable native build  | Blocked | Expo prebuild and CocoaPods completed, but Xcode could not select a simulator destination because the required iOS 26.5 platform/runtime is not installed. |
| Android native               | Not run | No Android SDK/AVD or `adb` executable was available. Chromium device emulation is not counted as native evidence.                                         |
| Packaged desktop playback    | Not run | The Electron run used the development main/preload composition and intentionally did not claim a packaged sidecar or real-source playback.                 |

## Browser And Electron Automation

The correctness matrix schedules 23 browser scenarios at 390 x 844, 768 x
1024, 1024 x 768, and 1440 x 1000. It records dark/light Settings and Search
captures, validates pointer and keyboard focus, and uses numeric assertions for
overflow, Library columns/card widths/gaps, MediaRail bounds, and the final
caption. Project-aware checks skip combinations that do not apply to a given
viewport or input mode.

Commands:

```bash
npm run test:golden-path
npm run test:electron-smoke
```

Final local results on the current worktree:

- Browser correctness matrix: **80 passed, 12 intentional skips, 0 failed**
  across 92 scheduled cases (4.2 minutes).
- Browser screenshot refresh: **28 passed, 0 failed**, producing 80 PNGs
  in 1.8 minutes under `artifacts/playwright-browser-results/` (dark/light
  Settings and Search, plus login, onboarding, Home, Downloads, player preview,
  and recovery at all four viewports).
- Electron development-shell smoke: **1 passed, 0 skipped, 0 failed** (6.7
  seconds). Its zoom captures are
  `artifacts/playwright-results/electron-smoke-electron-sm-3fc79-cts-media-and-survives-zoom-electron-smoke/electron-about-125.png`
  and
  `artifacts/playwright-results/electron-smoke-electron-sm-3fc79-cts-media-and-survives-zoom-electron-smoke/electron-about-150.png`.

The Electron smoke launches `apps/desktop/src/main.js`, uses the actual preload
bridge and IPC handlers, and writes its screenshots under that run's
`artifacts/playwright-results` directory. Its development-only smoke gate
suppresses local bridge process ownership so the test cannot stop or replace a
developer's bridge.

## Native iOS Attempt

A disposable copy was used, then removed. These stages completed:

1. `expo prebuild --platform ios --no-install --clean`
2. `pod install`

The generated workspace could not reach compilation or launch. Xcode 26.6
reported that the iOS 26.5 platform required by its simulator SDK was not
installed. The host only exposes iOS 26.2 and iOS 17.2 simulator runtimes, and
Xcode marked all destinations ineligible. Consequently no iPhone/iPad portrait
or landscape screenshots were produced and no native layout claim is made.

## Evidence Boundary

- Browser viewports validate responsive renderer composition, not native safe
  areas, platform controls, decode, or physical-device behavior.
- Electron smoke validates the development shell's real main/preload IPC
  contract, not packaging, signing, bridge sidecar startup, torrent playback, or
  a release build.
- Android is explicitly **Not run**. iOS is **Blocked after prebuild and Pods**,
  not a native pass.

## Same-day Player And Recovery Follow-up

The later follow-up on this branch adds the restrained player chrome, immediate
source-preparation cancellation (including Escape on web/Electron), actionable
Detail metadata recovery, detached stream-server stdin, and an exact playback
quality allowlist. This section records implementation-level validation only;
it does not extend the real-source, packaged-desktop, or native-device claims
above.

Completed validation:

- `node --test scripts/dev-runtime.test.cjs`: **14 passed, 0 failed**. This
  includes ignored daemon stdin, preserved stdout/stderr, signal forwarding,
  and listener cleanup.
- Targeted metadata/recovery validation: **9 of 9 tests passed**. The broader
  Detail/hook regression run passed **26 of 26 tests**, including those 9.
  Locale-key parity also passed for English, Dutch, and Spanish.
- Final quality validation: **28 of 28 mobile tests**, **10 of 10 shared
  contract tests**, and **31 of 31 planner tests passed**. Coverage includes
  preference migration, full-set allowlist propagation, schema rejection of
  SD preferences, and excluding SD/unclassified sources before ranking.
- Quality-recovery follow-up: **14 mobile tests and 17 shared tests passed**.
  An allowlist-only failure now routes to Playback settings; mixed
  compatibility failures retain generic recovery.
- Torrent cancellation follow-up: **49 of 49 tests passed across 2 suites**.
  Coverage includes cancellation during gateway creation, a late-created job,
  an active poll, the poll delay, and session cancellation without failure or
  fallback events.
- Metadata failure semantics: **42 of 42 server service/controller/API tests**
  and **9 of 9 mobile recovery tests passed**. Explicit absence remains 404;
  total provider failure is a recoverable 503 and partial success stays usable.
- Metadata circuit-breaker regression: **19 of 19 aggregator
  service/controller tests passed**. Four consecutive upstream metadata 404s
  perform exactly four requests, do not retry or open the provider circuit,
  and a following valid-title request succeeds normally.
- Player keyboard regression: **13 of 13 unit/component tests** and **1 of 1
  focused desktop Playwright test passed**. Volume owns Arrow keys and Home/End,
  preserves a visible focus ring, and no longer leaks those keys into video
  seeking.
- `npm run format:check`: **passed**.
- `npm run typecheck:all`: **5 of 5 tasks passed**.
- `npm run lint`: **passed with 0 errors**; the command still reports 23
  pre-existing server warnings.
- `npm test`: **6 of 6 Turbo tasks passed**. The server package completed
  **234 of 234 tests**; Shared completed **42 of 42** and Stream Server
  completed **117 of 117**, with every other workspace suite also completing without a
  failure.
- `npm run test:golden-path`: **80 passed, 12 conditionally skipped** across
  390x844, 768x1024, 1024x768, and 1440x1000 projects in 4.2 minutes. The
  desktop player preparation flow proves Escape cancellation and gateway
  cleanup. Geometry assertions cover compact chrome and non-tabbable passive
  hit areas. Desktop, preparation, and compact-phone screenshots were visually
  inspected; the compact status and action rows do not overlap.

- `npm run build`: **4 of 4 build tasks passed**.
- `npm run mobile:config:check`: **passed** for development, preview, and
  production.
- `npm run test:electron-smoke`: **1 passed** against the real Electron
  main/preload bridge, including managed-media inspection and 125%/150% zoom.
- `npm run release:gate`: **passed with no failed checks**.
- A manual `npm run dev:stream-server` smoke under Node 24.18.0 started the
  bridge on port 11470 without a TTY `read EIO`; Ctrl-C reached the child and
  completed graceful cleanup.
- The final focused desktop run for Escape cancellation passed **1 of 1**
  after the stream-engine cancellation changes.
- A final current-chrome run across phone web and desktop passed **4 of 4
  applicable tests** with 2 intentional project skips. The regenerated player
  captures were visually inspected after the keyboard fix.
