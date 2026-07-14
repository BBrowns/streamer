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

An interactive in-app browser smoke check covered the unauthenticated shell and
setup flow after the adaptive redesign continuation.

| Surface          | Compact web | Large web  | Horizontal overflow | App shell hidden |
| ---------------- | ----------- | ---------- | ------------------- | ---------------- |
| Login            | 390 x 844   | 1440 x 900 | Pass                | Pass             |
| Onboarding setup | 390 x 844   | 1440 x 900 | Pass                | Pass             |

The check also verified that login no longer renders a duplicate native header.
These browser results do not replace VoiceOver, TalkBack, native keyboard,
caption-safe, PiP, lock-screen, download, or Chromecast validation.
