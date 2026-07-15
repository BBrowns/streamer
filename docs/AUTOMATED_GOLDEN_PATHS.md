# Automated Golden Paths

The Playwright suite in `tests/golden-path` runs the real Expo web UI against
deterministic network fixtures. It exercises the phone-width web app and the
desktop renderer layout without depending on external add-ons, torrent peers,
cast hardware, copyrighted media, or a developer account.

## Covered Flows

- Full-viewport login and onboarding setup without duplicate app navigation or
  horizontal overflow.
- Login, catalog loading, detail navigation, and a valid Planner v2 request.
- Direct Play Best readiness and player navigation.
- Torrent no-peers fallback to the next direct candidate.
- Terminal no-peers recovery through an auto-opened advanced source list.
- Source-independent development preview of the real player control chrome.
- Bridge-unavailable guidance.
- Download and cast planner eligibility actions.
- Authenticated Home and Downloads keyboard focus, responsive layout, overlap,
  and screenshot checks.
- Obsidian Settings overview/detail routing, compact versus large list-detail
  behavior, dark/light screenshots, and legacy `/sources` compatibility.
- Canonical Search discovery, suggestions, results, compact filter sheet, large
  filter sidebar, partial-provider recovery, URL-normalized reset, and legacy
  `/search/results` compatibility.
- Command Palette arrow-key selection and Enter activation against the same
  search model.
- Intermediate 768 x 1024 and 1024 x 768 overflow and pane-behavior checks.

The suite defines 17 scenarios for both the 390 x 844 phone-web and 1440 x 1000
desktop-renderer projects: 34 scheduled cases. The recorded Obsidian run passes
32 cases and intentionally skips two project duplicates because intermediate
resize and persistent-sidebar reset checks run once in the desktop project.

Run the suite with:

```bash
npx playwright install chromium
npm run test:golden-path
```

Failures retain screenshots, traces, videos, and an HTML report under
`artifacts/`. CI uploads these files as `golden-path-browser-report`.

## Obsidian Screenshot Evidence

The checked-in dark/light reference captures live under
[`docs/pr-assets/obsidian-editorial`](./pr-assets/obsidian-editorial/):

- Settings overview and Playback detail at phone and desktop sizes.
- Search discovery, recent-search history, suggestions, results, and filters at
  phone and desktop sizes.

Together these provide 28 stable review images. Intermediate widths are covered
by layout assertions rather than additional golden files.

## Evidence Boundary

This suite is automated regression evidence only. The desktop project renders
the same responsive UI used by Electron, but it does not prove a packaged
Electron sidecar or native torrent engine. Phone-web does not prove iOS or
Android native playback. Those target claims remain `Unknown` until the manual
QA matrix is completed on real devices.
