# Playback QA Runbook

This document provides step-by-step instructions for performing manual playback validation across devices.

## Preparation

1.  **Environment:** Ensure you have access to:
    - iPhone (Real device or Simulator)
    - Android (Real device or Emulator)
    - Desktop (Electron build or `npm run dev:desktop`)
    - Web (Localhost or Staging)
2.  **Bridge:** Ensure the desktop bridge is running and reachable from your mobile devices.
3.  **Authentication:** Log in to the same account on all devices.

## Test Procedure

For each fixture in the [Playback QA Matrix](./QA_MATRIX.md):

### 1. First Frame (TimeToFirstFrame)

- **Step:** Trigger `Play Best` from the content detail page.
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
  Settings -> Sources & Devices -> Advanced Diagnostics -> Clean cache.

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
