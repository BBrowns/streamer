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

The suite currently runs ten scenarios in both phone-web and desktop-renderer
projects: 20 tests in total.

Run the suite with:

```bash
npx playwright install chromium
npm run test:golden-path
```

Failures retain screenshots, traces, videos, and an HTML report under
`artifacts/`. CI uploads these files as `golden-path-browser-report`.

## Evidence Boundary

This suite is automated regression evidence only. The desktop project renders
the same responsive UI used by Electron, but it does not prove a packaged
Electron sidecar or native torrent engine. Phone-web does not prove iOS or
Android native playback. Those target claims remain `Unknown` until the manual
QA matrix is completed on real devices.
