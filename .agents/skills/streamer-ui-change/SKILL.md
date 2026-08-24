---
name: streamer-ui-change
description: Use when implementing, reshaping, or reviewing Streamer UI in Expo mobile/web or the Electron renderer, including screens, components, responsive behavior, accessibility, interaction, screenshots, or visual regressions. Do not use for server-only work.
---

# Streamer UI Change

Build one adaptive, accessible presentation system from existing Streamer tokens and contracts.

## Workflow

1. Read `UI.md`, the current components/tests, and the relevant phone and desktop states. Use `streamer-change-design` first only when product behavior or durable component ownership is undecided.
2. Define primary action plus loading, empty, error, offline, disabled, permission, focus, reduced-motion, long-text, and partial-data states that apply.
3. Reuse shared tokens and primitives. Adapt to available space and input mode rather than device-name assumptions; preserve safe areas, keyboard, touch, pointer, and window resize behavior.
4. Keep Play Best primary and source selection advanced. Do not move playback, provider, download, or casting ownership into presentation code.
5. Test observable interaction and accessibility at the lowest stable boundary. Avoid snapshots as the only assertion.
6. Run the affected Jest/typecheck checks and relevant golden-path/visual matrix. Inspect compact and desktop output; do not call browser evidence native evidence.

Read [references/ui.md](references/ui.md) for accessibility, responsive, specialist, or broad visual work.

## Specialist routing

Load at most one optional specialist for a concrete need such as React Native performance, current web guideline audit, or new visual exploration. Project contracts, accessibility, security, compatibility, and measured behavior win conflicts.

## Completion

Report user-visible states changed, reused/new primitives, interaction and accessibility evidence, phone/desktop screenshots inspected, skipped native/device checks, and residual visual risk.
