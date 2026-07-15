# Accessibility and responsive visual QA - 2026-07-14

Scope: automated fixture validation for the Home and Downloads surfaces in the
browser renderer. Real-device QA remains deferred.

## Targets

| Target           | Viewport                     | Result |
| ---------------- | ---------------------------- | ------ |
| Phone web        | Playwright iPhone 13 profile | Pass   |
| Desktop renderer | 1440 x 1000 Chromium         | Pass   |

## Assertions

- The featured Home control has a visible keyboard focus outline.
- Home does not render nested HTML buttons.
- Home does not create horizontal page overflow.
- The empty Downloads action and Smart Downloads panel do not overlap.
- Reduced-motion mode is used while screenshots are captured.

## Screenshots

| Surface   | Desktop                                                     | Phone                                                   |
| --------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| Home      | [desktop](../pr-assets/accessibility-home-desktop.png)      | [phone](../pr-assets/accessibility-home-phone.png)      |
| Downloads | [desktop](../pr-assets/accessibility-downloads-desktop.png) | [phone](../pr-assets/accessibility-downloads-phone.png) |

## Remaining manual validation

- VoiceOver on iPhone and macOS.
- TalkBack on Android.
- Native touch-target and safe-area checks on iPhone and Android.
- Player controls with a real direct stream, remux stream, and cast session.

## Adaptive redesign continuation

An interactive in-app browser smoke check first covered the unauthenticated
shell and setup flow after the adaptive redesign continuation. These states are
now also permanent Playwright golden paths in both browser projects.

| Surface          | Compact web | Large web   | Horizontal overflow | App shell hidden |
| ---------------- | ----------- | ----------- | ------------------- | ---------------- |
| Login            | 390 x 844   | 1440 x 1000 | Pass                | Pass             |
| Onboarding setup | 390 x 844   | 1440 x 1000 | Pass                | Pass             |

The check also verified that login no longer renders a duplicate native header.
These browser results do not replace VoiceOver, TalkBack, native keyboard,
caption-safe, PiP, lock-screen, download, or Chromecast validation.

Player recovery now has compact and desktop-renderer checks for a gateway
failure, the explicit "Choose another source" route, automatic expansion of the
advanced source list, and a development-only preview of the real player chrome
without loading media.

## Obsidian Editorial continuation

The final renderer run adds routed Settings and canonical Search coverage in
dark and light mode. It records 24 review captures under
[`docs/pr-assets/obsidian-editorial`](../pr-assets/obsidian-editorial/) and
passes 32 of 34 scheduled cases; the other two are intentional project-aware
skips for checks that only need the persistent desktop sidebar.

| Surface                  | 390 x 844 | 768  | 1024 | 1440 x 1000 |
| ------------------------ | --------- | ---- | ---- | ----------- |
| Settings overview/detail | Pass      | Pass | Pass | Pass        |
| Search discovery/results | Pass      | Pass | Pass | Pass        |
| Filter sheet/sidebar     | Pass      | Pass | Pass | Pass        |
| Horizontal overflow      | Pass      | Pass | Pass | Pass        |

An independent in-app browser audit also confirmed that Inter Variable is
loaded (rather than only named), login controls meet the 44 px minimum target,
and login/onboarding have no horizontal overflow or runtime console errors.
Only existing React Native Web deprecation warnings for `pointerEvents` and
image `resizeMode` remain. These renderer findings do not convert native target
status from Unknown.
