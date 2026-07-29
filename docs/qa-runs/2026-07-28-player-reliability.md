# QA Run: player reliability, tracks, subtitles, and continuity

- Date: 2026-07-28
- Tester: local automation and visual inspection
- Build/version/git SHA: local branch `codex/reliable-progress-and-seek`
- Runtime: macOS, Node 24.18, npm 11.18, Playwright Chromium
- Scope: player state and timeline behavior, normalized audio/subtitle tracks,
  subtitle ingestion, fallback continuity, next-episode planning, structured
  diagnostics, responsive browser rendering, and production compilation.

## Result

All executable automated checks in scope passed:

| Check                               | Result                                            |
| ----------------------------------- | ------------------------------------------------- |
| Full repository verification gate   | passed                                            |
| Monorepo typecheck                  | 5/5 workspaces passed                             |
| Monorepo lint                       | passed with 19 pre-existing warnings and 0 errors |
| Shared unit tests                   | 19 files, 83 tests passed                         |
| Mobile unit/component tests         | 126 suites, 637 tests, 1 snapshot passed          |
| Stream-server tests                 | 14 files, 166 tests passed                        |
| Disposable-PostgreSQL server suite  | 35 files, 317 passed, 1 skipped                   |
| Golden-path browser matrix          | 98 passed, 38 project-aware skips                 |
| Source-controlled visual regression | 8 passed; 20 Darwin and 20 Linux files verified   |
| Real Electron main/preload smoke    | 1 passed                                          |
| Monorepo production build           | 4/4 build tasks passed                            |
| Security audit and release gate     | passed                                            |
| Native preflight harness            | 8 tests passed                                    |
| Native evidence preflight           | completed; native targets unavailable             |

The mobile test process still reports a pre-existing worker/open-handle cleanup
warning after Jest completes. All 126 suites and 637 tests completed
successfully before Jest forced that worker to exit.

## Reproduction

```bash
npm run verify:full
npm run test:visual
npm run visual:baseline:manifest -- --platform darwin
npm run visual:baseline:manifest -- --platform linux
npm run native:evidence:preflight
```

`verify:full` started the repository-managed ephemeral PostgreSQL container,
synchronized the schema, ran the complete server suite, and tore the container
down. It also ran formatting, lint, all workspace tests and typechecks, builds,
the browser matrix, Electron smoke, install-script policy, dependency audit and
the release gate.

## Visual inspection

The versioned Darwin and Linux player baselines now cover the normal player,
phone scrubbing, phone subtitle sheet, desktop hover preview, desktop inspect
sheet, actionable fallback and non-seekable progressive playback. Manual review
confirmed that:

- the scrub preview stays above the timeline and does not obscure controls;
- phone controls retain usable touch spacing;
- the inspect sheet scrolls on phone without escaping the viewport;
- the desktop sheet remains centered and bounded;
- diagnostic content contains classifications, counts, and durations rather
  than resolved media or subtitle URLs;
- progressive playback is visibly non-seekable without looking broken; and
- actionable failure state remains clear on the compact player.

The exact 20-file baseline set for each platform is enforced by the manifest
test and release gate.

## Evidence boundary

This run does not constitute real iOS, Android, tablet, or packaged-Electron
playback evidence. Native multi-audio switching, codec-specific playback, PiP,
casting, real torrent swarms, external subtitle-provider availability, and
device-level audio-session behavior still require target-device smoke tests.
The read-only native preflight found no bootable configured iOS simulator and
no matching Android AVD; it did not start an emulator, simulator, daemon, or
physical device.

The server suite did run against an isolated ephemeral Docker database. It does
not prove development or production database compatibility beyond the current
schema and test contracts.

Web preview JPEGs are implemented only for the active authenticated gateway job
while it owns a retained seekable remux cache. Direct/cross-origin media and
unprepared progressive playback deliberately retain timestamp-only scrub
feedback. No native simulator or physical-device run was possible in this
environment.
