# Obsidian Editorial UI/UX QA - 2026-07-14

Scope: deterministic renderer validation for the stacked Obsidian Editorial
overhaul. This run validates the visual system, routed Settings, canonical
Search, keyboard interaction, responsive composition, and localized contracts.

## Automated result

- Playwright: 32 passed, 2 intentional project-aware skips, 0 failed.
- Projects: phone-web at 390 x 844 and desktop-renderer at 1440 x 1000.
- Additional widths: 768 x 1024 and 1024 x 768.
- Visual modes: dark and light with reduced motion.
- Checked-in captures: 28 PNG files in
  [`docs/pr-assets/obsidian-editorial`](../pr-assets/obsidian-editorial/).

The Settings captures cover the category overview and Playback detail. Search
captures cover discovery, recent-search history, suggestions, results, and
filter surfaces. The suite also verifies canonical redirects, provider partial
failures, complete filter reset and URL synchronization, and Command Palette
arrow/Enter behavior.

## Accessibility and design-system result

- Palette contrast tests cover primary text, secondary text, accent actions,
  neutral primary actions, and focus colors in dark and light mode.
- Shared controls expose visible web focus and a 44 px minimum touch target.
- Reduced-motion media queries disable or shorten non-essential transitions.
- English, Dutch, and Spanish locale key sets are test-enforced for parity.
- Inter Variable was verified as a loaded browser font; Expo native uses the
  bundled static Inter weights.

## Evidence boundary

This run does not prove iOS/Android playback, packaged Electron sidecars,
native PiP, lock-screen controls, Chromecast, or real download persistence.
Those claims remain Unknown until recorded on the relevant physical or packaged
targets.
