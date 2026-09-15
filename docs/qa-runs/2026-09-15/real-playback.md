# Real playback QA — 2026-09-15

## Scope

Development Electron/in-app web run with the local API and desktop sidecar.
The run checked source preparation, HLS/fMP4 delivery, first frame, audio
selection, fallback, and the player state after a source ends. Native iOS and
Android playback were not part of this run.

Logs were inspected through the safe browser playback events. The record does
not contain credentials, magnets, hashes, media URLs, bridge URLs, filenames,
or raw FFmpeg output.

## Playback results

The following distinct titles reached `player.video_playing` and showed the
player controls during the home-network run:

| Title                    | Result | Notes                                                                                                                     |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| The Shawshank Redemption | Pass   | HLS first fragment and video playback observed. Audio modal exposed English and switching to English worked.              |
| Reacher — S4E7           | Pass   | HLS playback observed; seek-back control was exercised.                                                                   |
| The Dark Knight          | Pass   | First attempt followed the persisted “No preference” setting; after selecting English in Settings, replay showed English. |
| Inception                | Pass   | First candidate returned a safe `INTERNAL` failure; the next candidate reached HLS playback.                              |
| The Godfather            | Pass   | Player reached playback with English audio metadata.                                                                      |
| The Prestige             | Pass   | Player reached playback with English audio metadata.                                                                      |
| The Sixth Sense          | Pass   | Player reached playback with English audio metadata.                                                                      |
| Clue                     | Pass   | Player reached playback with English audio metadata.                                                                      |
| Breaking Bad — S1E1      | Pass   | Episode reached playback.                                                                                                 |
| The Matrix               | Pass   | First frame and continued HLS fragment delivery observed; audio label was English AC3.                                    |

This satisfies the ten-title smoke target for the home-network run. A first
frame is counted only when the browser log reported the video as playing, not
when a preparation screen merely disappeared.

## Negative and network-dependent observations

- `The Whisper Man` and `Interstellar` were exercised before the final URI
  binding fix and exhausted candidates with safe `INTERNAL`/`SOURCE_STALLED`
  outcomes. They are not counted as post-fix passes.
- `The Gentlemen — S1E1` reached playback in an earlier home-network attempt,
  but that source later stopped when its HLS window stopped advancing. The
  player now treats an HLS end far before the metadata runtime as a
  candidate-local early end instead of normal completion, then enters the
  bounded fallback path.
- On the latest work-network run, the selected candidates found peers (the UI
  showed two), but metadata did not arrive before the bounded metadata window.
  The logs showed `SOURCE_STALLED` and the UI ended on the actionable
  “Playback Timed Out” state with Retry and Choose another source. This is
  consistent with a network that permits some peer discovery but restricts or
  degrades the metadata/DHT/peer data path; it is not evidence that the bridge
  is unavailable.

## Fixes validated or added during this run

- Prepared URIs are no longer rebound after a terminal session or while a
  fallback owns the transition.
- HLS early-end detection now uses the metadata runtime after that metadata
  becomes available, and emits the generic safe
  `playback.source_ended_before_completion` breadcrumb.
- A terminal playback error remains actionable when the session has already
  cleared the current stream; Retry starts a fresh planning launch instead of
  showing only “Nothing is queued to play”.
- HLS audio output is constrained to stereo AAC for Chromium MSE while keeping
  the selected language/track.
- The actual persisted audio preference was verified as English after it was
  explicitly selected in Settings. Subsequent successful playback labels were
  English/ENG; no Spanish track was silently selected in the successful runs.

## Verification

- Mobile focused playback suites: 4 suites, 61 tests passed.
- Full mobile suite: 186 suites, 1,093 tests passed.
- Mobile and repository-wide typecheck passed (5 packages).
- Full stream-server suite: 23 test files, 241 tests passed, 4 skipped.
- Lint and format checks passed. The lint run retained 13 pre-existing server
  warnings; no lint errors were reported.
- Golden path: 118 tests passed and 70 were intentionally skipped by the
  existing project matrix.
- Development Electron smoke and packaged-renderer smoke passed.
- Browser evidence: first-frame/playback events for ten distinct titles on the
  home-network run; separate work-network run ended in bounded
  `SOURCE_STALLED` handling.

## Residual risks

- Torrent availability and metadata delivery are external/network-dependent;
  a work or guest network can produce peers without usable metadata.
- One earlier browser session lost authentication during the long exploratory
  round and logged a generic progress-sync warning. After re-authentication,
  the current Matrix run had no browser warning/error logs. A separate
  multi-tab refresh-token race should be tested independently if it recurs.
- This record does not claim native-device playback or complete-title
  delivery; those require real target runs and longer source availability.
