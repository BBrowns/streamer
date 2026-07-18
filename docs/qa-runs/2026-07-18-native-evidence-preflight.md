# QA Run: native evidence preflight

- Date: 2026-07-18
- Tester: local automation
- Build/version/git SHA: local branch `codex/capability-aware-search-correctness`
- Runtime: macOS host, Xcode 26.6, Node 24.18.0
- Scope: prerequisite inspection only; no native application or physical device
  was started.

## Results

| Target                  | Status  | Notes                                                                                                                                                                                                                                                                          |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| iOS Simulator           | Blocked | The iPhoneSimulator SDK is 26.5, while installed runtimes are iOS 17.2 and iOS 26.2. An iPhone 15 exists only on the other runtime; install iOS 26.5 plus an iPhone 15 device. The ignored generated `ios/` project is absent, so deployment compatibility cannot be inferred. |
| Android Emulator        | Not run | SDK/tool files exist, but Detox expects `Pixel_3a_API_34_extension_level_7_x86_64`, which is not installed. The preflight did not execute `adb` or `emulator`.                                                                                                                 |
| iPhone physical device  | Not run | No pairing, querying, or app launch was attempted.                                                                                                                                                                                                                             |
| Android physical device | Not run | No `adb` daemon, device query, or app launch was attempted.                                                                                                                                                                                                                    |

## Evidence

```bash
npm run native:evidence:preflight:test  # 8 passed
npm run native:evidence:preflight
npm run native:evidence:preflight -- --json
```

The preflight is intentionally read-only and exits successfully when a
prerequisite is absent. It is not a simulator, emulator, or physical-device
validation result. After installing the matching iOS runtime/device and Detox
AVD, run a disposable prebuild and the target-specific Detox smoke, then add a
separate native QA record with build, device, fixture, and playback results.
