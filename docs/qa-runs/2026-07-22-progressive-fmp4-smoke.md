# QA Run: progressive fMP4 playback smoke

- Date: 2026-07-22
- Tester: local automation
- Build/version/git SHA: local branch `codex/fast-source-readiness`
- Runtime: macOS, FFmpeg 7.1.1, Playwright Chromium
- Scope: the actual stream-server `serveTorrentFile` progressive-fMP4 route
  with a locally generated H.264/AAC MKV fixture. This is browser transport
  evidence, not real add-on, torrent-swarm, native-device, or packaged Electron
  evidence.

## Result

The smoke harness fed a 10.2 MB / 40-second MKV slowly into the actual
stream-server route with `remuxFormat: "mp4"` and
`remuxStrategy: "progressive-fmp4"`. Chromium decoded the chunked response
before the source stream finished:

| Observation       | Result                                            |
| ----------------- | ------------------------------------------------- |
| `loadedmetadata`  | 1.80 s                                            |
| `canplay`         | 1.91 s                                            |
| `playing`         | 3.79 s                                            |
| Playback position | greater than 1 second while source was still open |

The served response had no complete-file materialization step. It used FFmpeg
fragmented MP4 output (`empty_moov` followed by `moof` media fragments), which
is the intended primary Play transport for remuxed torrents.

## Reproduction

The disposable harness and fixture are deliberately outside the repository:

```bash
npx tsx /private/tmp/streamer-progressive-fmp4-smoke.mts \
  /private/tmp/streamer-progressive-fmp4-input.mkv
```

Both Playwright Chromium and FFmpeg must be installed locally. The existing
golden-path and Electron smoke suites do not cover this route: they validate the
mocked renderer flow and desktop main/preload boundary respectively.

## Evidence boundary

This proves that Chromium can decode the real FFmpeg fMP4 HTTP response while
the input remains unfinished. It does **not** prove that an external add-on
returns a healthy source, that a torrent has peers, that an HEVC/AV1 source is
decodable after container transmux, or that the exact route works on a native
device or packaged Electron shell. Those remain separate QA targets.
