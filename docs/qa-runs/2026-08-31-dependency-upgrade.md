# QA Run: dependency and native toolchain upgrade

- Date: 2026-08-31
- Tester: local automation and simulator/emulator tooling
- Build/version/git SHA: uncommitted working tree on `codex/migrate-rngh3`
- Host runtime: macOS, Node 26.7.0, npm 12.0.2, Xcode 26.6, JDK 17
- Scope: validate the Expo 57/RN 0.86.3 dependency alignment and native
  modules after the safe patch/minor upgrade.

## Result

| Check                                | Result | Evidence                                                                                                                                                                                                                                    |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency install and script policy | Pass   | `npm run ci:install` completed with lifecycle scripts disabled, reviewed patches, and the approved `node-datachannel` rebuild.                                                                                                              |
| Compatibility and audits             | Pass   | Seven dependency contract tests passed; full and production `npm audit` both report zero vulnerabilities; install-script and audit policies passed.                                                                                         |
| Workspace verification               | Pass   | `verify:quick`, typecheck (5/5 packages), workspace build, mobile Jest (172 suites/929 tests), stream-server (203 tests), server unit tests (233 tests), Electron smoke, and browser golden path (118 passed, 70 intentional skips) passed. |
| iOS simulator native build           | Pass   | Disposable Expo prebuild and 127/131 CocoaPods completed; `xcodebuild` for the configured iPhone 15 simulator compiled RN 0.86.3, Reanimated 4.5.5, Worklets 0.10.4, and safe-area-context 5.9.1 with New Architecture enabled.             |
| iOS simulator install/launch         | Pass   | `com.bbrowns.streamer` installed and launched on iPhone 15 (PID 9397). No Metro/API-backed playback journey ran.                                                                                                                            |
| Android debug APK                    | Pass   | Disposable Expo prebuild and `./gradlew assembleDebug` completed with the configured New Architecture and JDK 17.                                                                                                                           |
| Android test APK                     | Pass   | Disposable Expo prebuild with the native packaging config plugin and `./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug` completed successfully with JDK 17.                                                                |
| Android emulator launch              | Pass   | The configured ARM64 AVD booted with SwiftShader; the debug APK installed and `com.bbrowns.streamer` launched as `DevLauncherActivity` (no Metro/API-backed journey).                                                                       |
| Server integration suite             | Pass   | Docker-backed isolated PostgreSQL run completed with 38 test files and 342 passing tests (1 intentional skip); the ephemeral container was torn down afterward.                                                                             |

## Evidence boundary

This run validates dependency installation, native compilation, simulator/
emulator launch shells, and the Docker-backed server integration suite. It does
not claim physical-device playback, a Metro/API-backed mobile journey, Detox
journeys, real providers, torrent swarms, downloads, casting, or codec-specific
playback. Generated Expo `ios/` and `android/` projects remain disposable and
are not part of the repository change.
