# QA Run: Living Cinema delivery process

## Scope

- Pull request: [#241](https://github.com/BBrowns/streamer/pull/241)
- Final feature revision: `17b36240ae90eb5e1ad3c1c1722eeb86ff1f90c9`
- Merge revision: `1599df96a552b9c1c3d1c3c9f24936ae6ab407b0`
- Runtime scope: browser renderer and Electron-oriented UI change
- Physical-device QA: not run

## Initial failures

The first ready-for-review CI run failed in two root jobs:

1. `Golden Path Browser Matrix (desktop-renderer)` failed because the test read
   the Play/Pause control during a state transition. The page snapshot showed
   `Pause playback` while the test was waiting for `Play playback`.
2. `Visual Regression (Committed Linux Baselines)` failed because the tracked
   Linux screenshots were stale relative to the current renderer output.

The combined Golden Path and Release Gate failures were downstream results, not
independent root causes.

## Resolution

- The player test now waits for either valid control state, normalizes playback
  to paused, and only then performs geometry assertions.
- The 44 Linux baselines were replaced with the exact successful CI-generated
  candidate artifact after comparing candidate files with the failing actual
  screenshots and validating the manifest.

## Verification

- Focused player test: passed.
- Desktop browser golden paths: 37 passed, 0 failed.
- Prettier check for the changed test: passed.
- Linux visual baseline manifest: passed.
- Follow-up CI run `32735664310`: all required checks passed.
- Release Gate: passed.

## Process lessons

- Keep large UI work in independently verifiable slices.
- Treat visual baseline provenance and platform as part of the evidence.
- Normalize dynamic control state before geometry assertions.
- Inspect root CI failures before dependent gates.
- Record browser/Electron evidence separately from physical-device QA.
