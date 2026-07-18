# Playback QA Runbook

This document provides step-by-step instructions for performing manual playback validation across devices.

## Preparation

1.  **Environment:** Ensure you have access to:
    - iPhone (Real device or Simulator)
    - Android (Real device or Emulator)
    - Desktop (Electron build or `npm run dev:desktop`)
    - Web (Localhost or Staging)
2.  **Bridge:** Ensure the desktop bridge is running and reachable from your mobile devices.
    Native mobile torrent downloads require the desktop bridge LAN URL, not
    `localhost` or `127.0.0.1`. Sources & Devices should show a LAN URL
    warning when a native device is configured with a loopback bridge URL.
3.  **Authentication:** Log in to the same account on all devices.

## Test Procedure

For each fixture in the [Playback QA Matrix](./QA_MATRIX.md):

### 1. First Frame (TimeToFirstFrame)

- **Step:** Trigger the consumer-facing **Play** action from the content detail
  page. `playBest()` is the internal planner action name only.
- **Verification:** The player should open, show the correct readiness states (e.g., `finding_peers`, `buffering`), and start the video.
- **Expectation:** Video starts within the timeout budget (default 120s for torrents, much faster for direct).

### 2. Seeking

- **Step:** Seek to the middle of the video.
- **Verification:** The player should quickly resume playback from the new position.
- **Expectation:** Smooth seeking without "unsatisfiable range" errors or infinite buffering.
- **Note:** MKV remux output is materialized to a temporary MP4 before byte-range
  seeking is reliable. During materialization the player should show a
  `remuxing`/preparing state, allow cancellation, and avoid pretending seeking
  is ready before the remuxed file exists. Bridge health should also show
  FFmpeg runtime status and remux cache limits.

### 3. Fallback

- **Step:** Play a known "Broken Source" (F8) or force a timeout.
- **Verification:** Observe the `trying_fallback` state in the player overlay.
- **Expectation:** The orchestrator automatically selects the next best candidate and resumes.

### 4. Cancellation

- **Step:** While a stream is loading (e.g., `finding_peers`), navigate back or close the player.
- **Verification:** Check the Bridge Logs or Gateway Jobs list.
- **Expectation:** The gateway job for that session should be marked as `cancelled` or deleted.

### 5. Cleanup

- **Step:** Stop a stream or delete a download.
- **Verification:** Check the `stream-server` temp/cache directory or the app's offline media folder.
- **Expectation:** No orphaned `.part` or `.remux` files remain after the session is closed.
- **Optional bridge check:** Call `POST /api/cache/torrent/cleanup` on the
  local bridge to force inactive torrent cache cleanup. When bridge auth is
  configured, include the bridge token. Active torrent directories should be
  protected and the response should report the cleanup result plus current
  `torrentCache` status. The same cleanup can be triggered from
  Settings -> Advanced -> Clean cache.

### 6. Offline Verification

- **Step:** Complete a download, restart the app, and open Downloads while the
  source is unavailable.
- **Verification:** Only a managed regular media file that is at least 1 MiB,
  matches reliable Content-Length metadata, and passes the local video probe is
  labeled **Ready offline**.
- **Expectation:** A legacy completion, 206 KB file, directory, HTML/JSON,
  torrent metadata, size mismatch, timeout, or decode failure loses Ready
  status and is classified as Needs verification, Incomplete, or Failed.

### 7. Selection And Undo

- **Step:** Select multiple Library or Download rows, change filters, cancel,
  and schedule a destructive bulk action.
- **Verification:** Episode rows remain independently selectable, filter change
  and Cancel clear selection, and the action bar is absent at zero selections.
- **Expectation:** Library removal changes library membership only. Download
  deletion waits seven seconds and can be undone during that window.

## Automated Correctness Pass

Before recording a manual run, execute the deterministic renderer suite and the
real development-shell smoke:

```bash
npm run test:golden-path
npm run test:electron-smoke
npm run native:evidence:preflight
```

The browser projects cover 390 x 844, 768 x 1024, 1024 x 768, and 1440 x 1000.
The Electron smoke uses the real main/preload IPC composition for version
labels, managed-file inspection, and 125%/150% zoom. Keep these evidence limits
explicit: Chromium viewport emulation is not native iOS/Android proof, and a
development Electron smoke is not a packaged sidecar or signing test. The
native preflight is read-only: it reports configured Detox/SDK/AVD prerequisites
and next actions without booting a target, and does not count as a native pass.

## Log Capture

If a test fails:

1.  **Mobile:** Capture logs via `sentry` or `react-native-log-view`.
2.  **Desktop:** Check the Electron console and `stream-server.log`.
3.  **Server:** Check the main API server logs.
4.  **Redaction:** Ensure the logs do not contain raw magnets or tokens before sharing.

## Recording Results

Create a dated run record under `docs/qa-runs/` using the template in
[QA_MATRIX.md](./QA_MATRIX.md). Do not mark a runtime as supported unless the
result is recorded with build, device, source fixture, and pass/fail notes.
When preparing a release candidate, complete [RC_CHECKLIST.md](./RC_CHECKLIST.md)
and link every required target run from the checklist.
