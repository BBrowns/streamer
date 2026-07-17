# Automated Golden Paths

The Playwright suite under `tests/` validates the real Expo web UI against
deterministic network fixtures and includes one separate smoke test that starts
the real Electron main process and preload bridge. It does not depend on
external add-ons, torrent peers, cast hardware, copyrighted media, or a
developer account.

## Browser Coverage

The 28 browser scenarios run at all four supported evidence sizes:

| Project                | Viewport    | Window intent                  |
| ---------------------- | ----------- | ------------------------------ |
| `phone-web`            | 390 x 844   | Compact, touch-enabled web     |
| `tablet-portrait-web`  | 768 x 1024  | Medium portrait composition    |
| `tablet-landscape-web` | 1024 x 768  | Expanded landscape composition |
| `desktop-renderer`     | 1440 x 1000 | Large desktop composition      |

They cover:

- Full-viewport login and onboarding without duplicate navigation or
  horizontal overflow.
- Catalog loading, Detail navigation, one valid internal `playBest()` planner
  request, consumer-facing **Play**, and direct player navigation.
- Torrent no-peers fallback, advanced source recovery, bridge-unavailable
  guidance, and the development player preview.
- Download and cast planner eligibility, including the consumer-facing **Cast
  to device** label.
- Home and Downloads responsive composition, keyboard focus, and overlap
  checks.
- Library grids with fixed-width cards and numeric assertions for column count,
  equal card width, 16 px gaps, and page overflow.
- Shared `MediaRail` bounds, disabled end arrows, and proof that the final
  poster caption remains fully visible.
- Obsidian Settings overview/detail routing, mutually exclusive Sources and
  Advanced responsibilities, dark/light captures, and legacy `/sources`
  compatibility.
- Active Search idle/recents, bounded suggestions, submitted poster-grid
  results, compact filter sheet, large filter sidebar, no-match,
  no-searchable-provider, provider-outage, and partial-provider states.
- Search URL normalization, reset, clear/resubmit, browser back/forward state,
  and legacy `/search/results` compatibility.
- Pointer focus without a persistent ring and a strong three-pixel keyboard
  `:focus-visible` treatment on the actual focused node.
- Command Palette arrow-key selection and Enter activation against the same
  Search model.

Dark and light screenshots are emitted for Settings overview/detail and Search
idle/recents/suggestions/results/filters/no-results/no-provider/partial states.
Intermediate pane and overflow behavior is asserted directly at 768 x 1024 and
1024 x 768. Six viewport- or desktop-specific scenarios are skipped in each
non-desktop project, so the complete browser schedule is 112 cases: 94
executable assertions and 18 intentional project-aware skips.

## Real Electron Smoke

`tests/electron-smoke` launches `apps/desktop/src/main.js` through Playwright's
Electron driver with an isolated user-data directory. The actual preload IPC
contract is used to verify:

- separately labeled desktop product and Electron runtime versions, Build SHA,
  and Channel;
- exact `desktopBridge.inspectFile()` results for a managed media file larger
  than 1 MiB; and
- real `BrowserWindow.webContents` zoom at 125% and 150%, with numeric
  horizontal-overflow assertions and screenshots.

The smoke-only bridge suppression is accepted only in a non-packaged build. It
avoids starting or stopping the developer's local bridge while preserving the
real BrowserWindow, preload, IPC, and settings renderer. Linux environments
without a display skip this one smoke case explicitly; use Xvfb to execute it.

## Running The Suite

```bash
npx playwright install chromium
npm run test:golden-path
```

To run only the real-shell contract:

```bash
npm run test:electron-smoke
```

Failures retain screenshots, traces, videos, and an HTML report under
`artifacts/`. Successful screenshot calls are also written into their
Playwright result directories. CI uploads these artifacts; they are run
evidence, not source-controlled product assets.

The earlier checked-in Obsidian references remain under
[`docs/pr-assets/obsidian-editorial`](./pr-assets/obsidian-editorial/). They are
historical design-review captures; current correctness should be judged from a
fresh deterministic run.

## Evidence Boundary

Browser projects prove responsive renderer behavior, not native iOS or Android
layout or playback. The Electron smoke proves the development main/preload IPC
composition, version labels, managed-file inspection, and zoom behavior; it
does not prove a packaged sidecar, torrent engine, real download decode, or
release signing. Native and packaged support claims remain unchanged until
their target-specific QA runs are recorded.
