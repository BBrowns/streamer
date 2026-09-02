# Torrent playback implementation verification — 2026-09-01

## Scope

Verification of the metadata-readiness, progressive-fMP4 delivery promotion,
bridge route acceptance, error classification and safe logging changes. This
record contains no credentials, tokens, magnets, hashes, media URLs, bridge
URLs, filenames or raw FFmpeg output.

## Automated evidence

- `packages/stream-server`: 21 suites, 211 tests passed.
- `apps/mobile`: 177 suites, 965 tests passed, 1 snapshot passed.
- `npm run typecheck:all`: passed (5 workspaces).
- `npm run lint`: passed with 0 errors and 13 pre-existing server warnings.
- `npm run format:check`: passed.
- `npm run test:golden-path`: 118 passed, 70 intentionally skipped, 0 failed.
- `npm run test:electron-smoke`: passed.
- `npm run test:electron-packaged-smoke`: passed; packaged renderer was
  `packaged-file` and rendered a non-empty body.
- `git diff --check`: passed.

## Covered behavior

- Torrent metadata can satisfy readiness before `ready` when the file list is
  populated, and readiness listeners are removed on success, timeout and
  cancellation.
- A runtime-selected MKV is promoted from `range-http` to
  `progressive-fmp4`; the first-byte probe is the pre-playback gate and a full
  seekable remux is not started for primary playback.
- `range-http` to `progressive-fmp4` is accepted by the playback session only
  for the same candidate and execution target, with the expected capabilities.
- Asynchronous preparation failures remain fallbackable `INTERNAL` failures;
  genuine torrent-runtime unavailability remains `RUNTIME_UNAVAILABLE`.
- Metadata, selected-container, delivery, first-byte, first-fragment,
  consumer-attachment and cache-handoff breadcrumbs are bounded and redacted.
- Peer-count logging records both increases and decreases, only when the value
  changes and at the existing bounded interval.

## Not claimed by this record

No live torrent/magnet run or native-device playback was performed as part of
this verification pass. The remaining acceptance evidence is a disposable,
controlled desktop run with a source that produces metadata, a source that
does not, a source without a playable video file, and cancellation during
metadata, first-byte and progressive remux phases.
