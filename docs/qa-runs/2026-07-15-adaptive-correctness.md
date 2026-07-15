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
| Responsive Expo web renderer | Pass    | All four browser projects completed: 79 passed, 9 intentional project-aware skips, 0 failed.                                                               |
| Electron development shell   | Pass    | Real Electron main/preload/IPC smoke passed for labeled build data, exact managed-file inspection, and 125%/150% zoom without horizontal overflow.         |
| iOS disposable native build  | Blocked | Expo prebuild and CocoaPods completed, but Xcode could not select a simulator destination because the required iOS 26.5 platform/runtime is not installed. |
| Android native               | Not run | No Android SDK/AVD or `adb` executable was available. Chromium device emulation is not counted as native evidence.                                         |
| Packaged desktop playback    | Not run | The Electron run used the development main/preload composition and intentionally did not claim a packaged sidecar or real-source playback.                 |

## Browser And Electron Automation

The correctness matrix schedules 22 browser scenarios at 390 x 844, 768 x
1024, 1024 x 768, and 1440 x 1000. It records dark/light Settings and Search
captures, validates pointer and keyboard focus, and uses numeric assertions for
overflow, Library columns/card widths/gaps, MediaRail bounds, and the final
caption. Three large-screen-only checks intentionally skip their three compact
or intermediate duplicates.

Commands:

```bash
npm run test:golden-path
npm run test:electron-smoke
```

Final local results on the current worktree:

- Browser correctness matrix: **79 passed, 9 intentional skips, 0 failed**
  across 88 scheduled cases (4.3 minutes).
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
