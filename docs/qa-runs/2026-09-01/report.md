# Streamer QA run — 2026-09-01

## Scope

- Local web renderer and Electron development/package smoke.
- Viewports: 390×844, 768×1024, 1024×768 and 1440×1000.
- Fixture-backed playback, notifications, settings, add-ons and downloads flows.
- Credentials, tokens, media URLs, magnets, info hashes and bridge URLs are not
  included in this record.

## Evidence

- [Home — phone](./home-phone.png)
- [Home — tablet portrait](./home-tablet-portrait.png)
- [Home — tablet landscape](./home-tablet-landscape.png)
- [Home — desktop](./home-desktop.png)
- [Packaged Electron onboarding shell](./packaged-onboarding.png)

## Results

- Packaged Electron loads the bundled file renderer and shows a non-empty
  onboarding/app shell. The previous blank white window is not reproducible.
- Development Electron smoke: passed.
- Packaged renderer smoke: passed (`renderer: packaged-file`, non-empty body).
- Full golden path: 118 passed, 70 intentionally skipped, 0 failures.
- Focused regression tests: 39 passed; player component tests: 18 passed;
  desktop test suite: 97 passed.
- Server API regression file: 26 passed, including the PATCH CORS preflight
  used by notification actions. The full server suite had one unrelated
  catalog golden-path failure because the external catalog returned no metas.
- `verify:quick`, typecheck, lint, format, architecture and package-input
  validation passed. Lint retains 13 pre-existing server warnings and no
  errors.

## Latest implementation follow-up

The final implementation checks and reruns are recorded in
[implementation-follow-up.md](./implementation-follow-up.md). That record
supersedes the earlier smoke totals where they overlap; historical results
above remain unchanged.

## Click coverage

Exercised navigation, search open/close, profile menu, settings routes,
notification panel, library filters and selection mode, downloads, source
runtime re-check, add-on install-state UI, player controls, timeline hover,
playback settings, fallback recovery, retry and modal dismissal. The four
responsive viewport classes were checked for visible navigation and focus
behavior.

Destructive actions and external integrations were not activated: account
deletion, data export, add-on removal, and Trakt/Real-Debrid linking require a
fixture or disposable account.

## Fixed during this run

- Electron now exports and validates a local renderer, uses `file:` for
  packaged builds, and displays a visible recovery page on load failure.
- Auth/SecureStore readiness gates protected queries, sync and bridge preflight;
  SecureStore failure fails closed without leaving readiness pending.
- Notification polling is visibility/auth gated and 429 responses use bounded
  `Retry-After` cooldowns without retry hammering.
- The notification “mark all read” action now passes browser preflight by
  allowing its required `PATCH` method in the local API CORS policy.
- Premature playback end is treated as a candidate failure and uses the
  existing session-owned fallback/cancellation path.
- Medium topbar hit targets, route accessibility isolation, modal stacking and
  web pointer-event handling were corrected.
- The player full-screen overlay no longer intercepts its own control clicks or
  timeline hover events. This was the cause of the 13 functional golden-path
  failures seen before the final fix.

## Remaining findings

1. The manually opened `/settings/interface` route rendered the generic
   Settings overview. Confirm whether this is an intentional redirect or a
   missing Interface section.

## Visual baseline classification

The explicit visual run produced 14 failed assertions across 13 distinct diff
artifacts; no snapshots were updated.

| Diff group                           | Classification                                                                                                              | Decision                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Home, dark/light, phone/desktop      | Intentional renderer change: web text-shadow cleanup                                                                        | Keep product change; review baseline before updating                |
| Add-ons, dark/light, phone/desktop   | Baseline/environment drift limited to typography, borders and empty-state rendering; no corresponding functional regression | Keep snapshots unchanged; regenerate only after clean visual review |
| Downloads, dark/light, phone/desktop | Baseline/environment drift limited to typography, badges and spacing; functional Downloads flow passes                      | Keep snapshots unchanged; regenerate only after clean visual review |
| Player recovery, dark phone          | Intentional recovery-card presentation difference; fallback behavior is covered and passes                                  | Keep snapshot unchanged pending product visual sign-off             |

The visual run therefore remains a reviewed, explicitly known gate rather than
an unexamined snapshot update. The existing 13 diff artifacts are available in
the local Playwright results directory and are not source evidence.

## Logging notes

Renderer, Electron, stream-server and Sentry paths now use bounded, redacted
events. The final browser log check found no new warnings/errors in the recent
tail. Expo export still reports the known `node-vibrant` invalid-exports
package warning; this is a dependency warning, not a runtime app exception.

The packaged smoke used an unsigned local macOS package with
`CSC_IDENTITY_AUTO_DISCOVERY=false`; it is renderer/package evidence, not
code-signing or notarization evidence.
