# Streamer QA follow-up — 2026-09-01

## Scope

This follow-up revisited the current local web build with browser interaction
and console-log monitoring. The authenticated session was available during the
first part of the run, then expired after a sync authentication refresh
failure. The remainder covered the logged-out auth shell. No credentials,
tokens, media URLs, magnets, info hashes or bridge URLs are included here.

## Coverage

- Home, hero details, catalog details, search, query filters and tab navigation.
- Library filters, history, selection/cancel and Downloads empty-state actions.
- Smart Downloads toggles, quality radios and autoplay, with settings restored.
- Settings overview, Account, Playback, Downloads, Sources & Devices, Add-ons,
  Appearance, Privacy, About, Terms, Privacy Policy and Advanced.
- Profile, password and active-session modals, using cancel/close paths only.
- Login, empty-submit validation, Forgot Password, Register and responsive auth
  layouts at 390×844, 768×1024, 1024×768 and 1440×1000.
- Destructive/external actions were skipped: password submission, sign-out,
  account deletion, data export, cache cleanup, add-on removal and
  Trakt/Real-Debrid linking.

## Logging result

- 52 interaction checkpoints.
- 309 captured browser logs.
- 0 JavaScript error-level logs.
- 44 repeated `[Sync] Connection error: Unknown error` warnings.
- 1 `[Sync] Sync authentication refresh failed` warning.
- The recurring native animation warning remains a documented web fallback and
  was not counted as a new product issue.

## New findings

1. **Home hero details fail while a normal catalog detail works.** Clicking
   the Home hero's `View details` navigates to a detail route that shows
   `This title couldn't load`. `Try again` reproduces the same state. A normal
   catalog title opened from Search reaches the detail page successfully. The
   browser emitted no JavaScript error, so this needs API/provider correlation
   at the detail request rather than a generic client retry.

2. **Sync reconnect noise can end in a silent logout.** The WebSocket closed
   repeatedly with code `1006`, logged retries at 2s, 5s and 15s, then reported
   an authentication-refresh failure. The app changed from authenticated
   Settings to `Sign in to manage settings` without a visible session-expired
   explanation or recovery action. The warning message is too generic to
   diagnose the first failure, and the repeated retries make the console noisy.

3. **Compact Library shows duplicate Select controls.** At 390×844 two visible
   controls had the same `Select` accessible name: one in the compact header and
   one in the Library action row. They trigger the same selection mode, which
   makes the action appear duplicated and complicates keyboard/screen-reader
   navigation.

4. **Forgot Password controls are not exposed semantically.** `Send Link` and
   `Back to Login` are visibly clickable and work through pointer interaction,
   but the accessibility snapshot exposed both as generic text rather than a
   `button` or `link`. The login and registration submit controls do expose
   proper button roles.

## Passed during this follow-up

- Search query and content-type filters changed route state without an
  unmatched-route or browser error.
- Library history and selection cancel paths returned to the collection.
- Downloads Browse opened Search; Smart Downloads dependent controls enabled
  when the parent toggle was on and returned to their original state.
- Settings preference changes, legal-page navigation, modal cancel paths and
  the Sources/Add-ons recovery path completed without error-level logs.
- Empty auth submissions produced local validation feedback without sending
  credentials.
- Tablet and desktop auth layouts rendered with the expected fields and a
  semantic Sign In button.

## Next repair candidates

- Trace the Home hero identifier through the detail metadata request and add a
  regression fixture for the failing identifier.
- Give sync a user-visible degraded/offline state, preserve the session when a
  refresh fails unless the API explicitly confirms invalid credentials, and
  make retry/backoff telemetry actionable without logging sensitive data.
- Render only one compact Library selection action and add semantic roles to
  the Forgot Password actions, then rerun the browser/accessibility pass.

## Visual baseline classification — 2026-09-01

The focused visual run covered 20 cases: 7 passed and 13 failed. The 13
differences match the existing baseline drift; no snapshots were updated.

- Home, four variants: environmental rasterization drift. Layout, content and
  interaction geometry are visually equivalent; the remaining differences are
  limited to small text/edge pixel changes.
- Add-ons, four variants: product-level rendering drift. The success notice
  tone and empty-state typography/placement differ consistently across the
  phone and desktop captures. This needs product review before accepting a new
  baseline.
- Downloads, four variants: product-level rendering drift in filter-chip and
  status styling. The current capture is coherent, but the intended visual
  state still needs review before accepting a new baseline.
- Player recovery, one variant: product-level typography and vertical-spacing
  drift in the `No Peers Found` fallback. The actionable controls remain
  present; the baseline is retained pending visual review.

The auth/sync changes in this run do not alter these fixture surfaces, and the
visual baseline files remain unchanged.
