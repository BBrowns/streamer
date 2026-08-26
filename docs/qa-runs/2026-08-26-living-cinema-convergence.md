# QA Run: Streamer Living Cinema convergence

## Scope and baseline

- Scope: production convergence steps 0–8 only.
- Step 9, the asymmetric Continue Watching experiment, was not started. No
  prototype branch, worktree, import, or production geometry change was made
  for that experiment.
- Execution branch: `codex/living-cinema-convergence`.
- Baseline: current `origin/master` at `28a81dcd7c2ca6633d070195053461e6bca3249e`.
- Final implementation head before this receipt: `4294cce`.
- A fresh isolated worktree was used at
  `/private/tmp/streamer-living-cinema-convergence`.
- The existing dirty checkout at `/Users/julianbruinsma/Documents/Playground /streamer`
  remained on `2892f0c6593ee241e33191b5b44bb3a260cafd86` with its pre-existing
  changes untouched.
- A final `git fetch origin --prune` confirmed that `origin/master` did not
  advance during execution.
- Runtime note: this host has Node `v24.18.0` and npm `11.16.0`; the repository
  policy requires Node `26.7.x` and npm `12.x`. No runtime policy was changed.

## Production slices and commits

| Slice                                                                   | Commit    | Main ownership                                                     |
| ----------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| Floating material levels and reduced-transparency fallback              | `b97a54f` | `FloatingSurface`, `useReducedTransparency`, focused tests         |
| Adaptive overlay infrastructure with Command Search ownership preserved | `735ed39` | `AdaptiveOverlay`, `CommandPalette`, `PlayerSettingsModal`         |
| Narrow keyboard correction                                              | `46dadbd` | remove global `/`; retain Meta/Ctrl+K and search button            |
| Selective utility containment flattening                                | `40d88ba` | Settings, Add-ons, Sources, meaningful retained surfaces           |
| Shared interaction-state harmonisation                                  | `830d3c1` | buttons, switches, segmented controls, poster cards, settings rows |
| Media-action terminology and accessibility labels                       | `cdb16ab` | Continue Watching and localized action copy                        |
| Evidence-backed legacy presentation removal                             | `b3fbf14` | unused `SettingsSection`, `CollapsibleSection`, `FilterSidebar`    |
| Golden-path convergence assertions                                      | `4f8f8db` | route, copy, overlay, and geometry assertions                      |
| Content-width-driven Settings resolver                                  | `226a489` | inner content width, two-column threshold, overflow assertions     |
| Utility-material boundary regression test                               | `5bd6796` | utility surfaces cannot consume cinematic ambience                 |
| Ownership and QA documentation                                          | `c13c73f` | `UI.md`, `ARCHITECTURE.md`, handoff and golden-path docs           |
| Reviewed Darwin baseline refresh                                        | `63b60b8` | eight Settings/Add-ons baselines only, after visual review         |
| CI typecheck compatibility fix                                          | `18f183b` | preserve web-only transitions while satisfying RN style typing     |
| Reviewed Linux baseline candidates                                      | `4294cce` | eight Settings/Add-ons baselines from the PR Linux candidate       |

## Design-convergence review before snapshot refresh

The rendered review was completed before refreshing the approved Darwin and
Linux baselines. The review used the browser renderer on the actual build and
inspected the following temporary captures; the captures were not added to the
repository.

| Surface        | Removed or retained containment                                                                 | Review result                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Settings       | Decorative nested grouping removed; readable section ownership retained                         | Neutral utility treatment, consistent spacing, two columns at 1440 and 1024, one column at 768, no overflow               |
| Account        | Identity/security grouping and sign-out danger scope retained                                   | Containment communicates account ownership and destructive scope; no cinematic ambience                                   |
| Add-ons        | Installed-item card nesting reduced; install/setup and success/error surfaces retained          | Setup ownership and recovery remain clear; installed content is flatter and neutral                                       |
| Sources        | Navigation grouping flattened; readiness, capability, forms, warnings, and diagnostics retained | Meaningful operational states remain visible without decorative card-in-card nesting                                      |
| Downloads      | Queue/status/recovery ownership retained                                                        | Status, progress, and actions remain scannable; no artwork-driven page ambience                                           |
| Notifications  | Row containment avoided where spacing/dividers establish hierarchy                              | Unread/status distinction remains explicit without unnecessary cards                                                      |
| Command Search | Generic overlay shell centralised; CommandPalette geometry and content ownership retained       | Top-center command layout, autofocus, keyboard selection, recents, loading/no-result states, and View all remain distinct |
| Profile menu   | One temporary menu surface retained                                                             | Menu ownership is clear, with Profile, Active sessions, Settings, and Sign out; no duplicate nested navigation            |
| Form overlay   | Form surface retained                                                                           | Modal ownership, scrim, focus handling, and readability remain clear                                                      |

Each retained surface was reviewed against the three convergence questions:

1. Is containment semantically necessary?
2. Can spacing or separators establish the same hierarchy?
3. Would removing the surface make interaction ownership less clear?

The implementation removes decorative containment only when the answers support
flattening. Errors, warnings, destructive actions, setup/install flows,
diagnostics, selection context, and modal ownership remain contained.

## Automated verification

### Passing checks

- Baseline characterization before changes: 163 Jest suites, 885 tests, and 1
  snapshot passed.
- Final mobile unit suite: 164 suites, 893 tests, and 1 snapshot passed.
- Focused slash, terminology, Settings, overlay, material, and interaction
  tests passed.
- Golden paths across compact, medium, expanded, and large projects: 27 passed,
  10 intentionally skipped, 0 failed.
- Visual regression: 20 passed, 0 failed, covering phone and desktop dark/light
  baselines.
- `npm run typecheck:all`: passed.
- Direct mobile typecheck after the CI fix: passed.
- `npm run lint`: passed with 18 pre-existing warnings and 0 errors.
- `npm run format:check`: passed.
- `npm run mobile:config:check`: passed.
- `npm run mobile:doctor`: 21/21 checks passed.
- `npm run test:electron-smoke`: 1 passed. The real Electron main/preload
  smoke exercised the development renderer, media inspection bridge, and 125%
  / 150% zoom overflow checks.
- `npm run security:install-scripts`: passed.
- `npm run security:audit`: passed with the repository's two reviewed,
  time-bounded `image-size` advisory exceptions.
- Server integration in serial mode against the ephemeral PostgreSQL
  container: 5 test files passed, 32 tests passed, and 1 test was skipped. The
  run used the explicit Prisma consent supplied for this task and a temporary
  test-only JWT environment value; no value was persisted.
- `npm run verify:quick`: passed.
- `npm run build`: passed for desktop, server, shared, and stream-server.
- `npm run release:gate`: passed with no failed checks.

### CI failure diagnosis and resolution

The first PR run (`32997140596`, head `a9663c6`) exposed two independent
issues:

- CI TypeScript rejected web-only `transition` properties in the typed
  `StyleSheet.create` objects for `AppButton` and `SegmentedControl`. The
  properties remain available to the web renderer and the style objects now
  use the repository's existing explicit web-extension typing convention.
- Linux visual regression failed only for the eight Settings/Add-ons images
  changed by this pass. The PR's Linux candidate artifact was downloaded, its
  eight changed images were inspected against the committed baselines, and
  only those exact eight candidates were committed.

The `Release Gate` failure was downstream of those two root failures.

### Checks not green or intentionally blocked

- `npm run verify:full` did not complete because its parallel `test:all` stage
  hit an existing server-test environment race: suites mutate and restore
  `process.env`, causing `JWT_SECRET` to disappear during imports. A serial
  diagnostic run passed 31 server test files (289 tests, 50 skipped), and the
  separately authorized serial integration run passed all five integration
  files. Build, golden, Electron, security, and release stages were run
  independently and passed.
- The standard parallel `test:all` invocation therefore remains red because of
  the existing test-isolation race, even though the affected server files pass
  when run serially with the test environment configured.

## Visual and accessibility evidence

### Risk-based visual matrix

| Window class | Size      | Evidence                                                  |
| ------------ | --------- | --------------------------------------------------------- |
| Compact      | 390×844   | Pixel baselines plus semantic golden-path assertions      |
| Medium       | 768×1024  | Semantic layout, Settings column, and overflow assertions |
| Expanded     | 1024×768  | Semantic layout, Settings column, and overflow assertions |
| Large        | 1440×1000 | Pixel baselines plus semantic golden-path assertions      |

Darwin browser output was rendered and inspected on this host. The Linux
candidate artifact produced by the PR's Ubuntu visual job was inspected for
all eight changed Settings/Add-ons images; no unchanged Linux baseline was
accepted. Existing Home, Detail, and Player coverage was retained. Exactly
eight Darwin and eight Linux Settings/Add-ons baselines changed in this pass.

### Manual/runtime checks actually performed

- Browser renderer: Playwright/Chromium on the Darwin host across all four
  window classes; dark/light visual coverage on compact and large target
  screens.
- Linux CI candidate: the eight changed Settings/Add-ons candidate images were
  inspected against their committed counterparts before the Linux baseline
  refresh; the candidate manifest reported all 44 expected files and matched
  the PR head used by the candidate job.
- Rendered design review: Settings, Account, Add-ons, Sources, Downloads,
  Notifications, Command Search, Profile menu, and a form overlay.
- Reduce Motion: browser `prefers-reduced-motion` emulation was exercised in
  the rendered golden-path environment; transforms are removed while focus,
  opacity, and functional feedback remain.
- Reduce Transparency: no native macOS/iOS toggle was manually exercised.
  Unit coverage verifies the opaque fallback, supported platform policy, and
  utility-material boundary. This is not native-device evidence.
- Electron: real development Electron main/preload smoke passed, including
  zoom behavior. Packaged macOS titlebar and traffic-light QA was not run.
- iOS simulator/device and Android emulator/device QA were not available and
  were not claimed. Browser and Electron evidence is not presented as native
  device evidence.

## Scope and legacy proof

- No `package.json`, lockfile, `packages/shared`, or Prisma schema file changed
  in this convergence branch.
- No new dependency, UI framework layer, IPC/preload method, playback,
  download, cast, source-selection, or persisted-state contract was added.
- The only `ContinueWatchingRow` production change is localized action labels
  and accessibility copy; production card geometry and rail layout are
  unchanged.
- The removed legacy presentations have zero production imports or route
  resolution after the change: `SettingsSection.tsx`,
  `CollapsibleSection.tsx`, and `FilterSidebar` are absent from production
  references. Remaining `SettingsSectionContent`, `SettingsSectionScreen`, and
  `FilterSheet` references are active, different owners and were preserved.
- Utility routes do not consume `CinematicTheme`; the regression test checks
  that utility material is derived from the neutral `ThemeColors` contract.
- Step 9 remains explicitly pending separate approval.

## Residual risks and follow-up

- Fix the existing server test-isolation race or make the serial test mode the
  supported CI invocation before claiming the aggregate `test:all` gate green.
- Re-run the full repository gate under the required Node `26.7.x` / npm `12.x`
  runtime after resolving the server test-isolation issue.
- Perform native Reduce Transparency and Reduce Motion checks on macOS/iOS,
  plus TalkBack/VoiceOver and touch-target checks on Android/iOS targets.
- Run packaged macOS window/titlebar QA and a broader independent Linux visual
  review when the required target environment is available.
- Step 9 may only begin after this production convergence is reviewed and
  explicitly approved; it must use its own branch/worktree and cannot modify
  production Continue Watching geometry.
