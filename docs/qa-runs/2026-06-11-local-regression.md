# QA Run: Local Regression

- Date: 2026-06-11
- Tester: Codex
- Build/version/git sha: local branch `codex/fix-pr87-90-gaps`
- Runtime: local unit/integration test runtime
- Device/OS: macOS development machine
- Network: local
- Bridge URL/owner: not exercised as a packaged app
- Add-ons: mocked fixtures only

## Results

| Flow                           | Fixture            | Status | Notes                                                                                              |
| ------------------------------ | ------------------ | ------ | -------------------------------------------------------------------------------------------------- |
| Remux timeout                  | F3/F6-style MKV    | Pass   | `serveTorrentFile` aborts FFmpeg after remux timeout and returns retryable `503`.                  |
| Remux cancellation             | F3/F6-style MKV    | Pass   | abort signal kills FFmpeg/source stream and returns non-retryable `410` for explicit cancellation. |
| Gateway remuxing status        | F3-style MKV       | Pass   | gateway reports `phase: remuxing` while remux materialization is in progress.                      |
| Download URL replan            | F1/F3-style source | Pass   | mobile/desktop resume paths re-resolve expired URLs and restart through safe runtime data.         |
| Download persistence redaction | F1/F3-style source | Pass   | persisted download tasks strip `downloadUrl`, `resumeData`, and `originalStream`.                  |

## Commands

```bash
npm run typecheck --workspace=@streamer/stream-server
npx tsc --noEmit --pretty false --project apps/mobile/tsconfig.json
npm run test --workspace=@streamer/stream-server -- torrent gateway
npm run test --workspace=apps/mobile -- downloadStore DownloadReplan DownloadService --runInBand
```

## Limitations

- This is not a real-device run.
- This does not validate packaged Electron, physical iPhone, physical Android,
  browser playback, real torrents, or real Chromecast hardware.
- This run should not be used to claim production playback support.
