---
name: streamer-ui-quality
description: Use when designing, implementing, refactoring, or reviewing Streamer UI in apps/mobile or the Electron renderer. Trigger for screens, components, styling, responsive layouts, interaction states, accessibility, design-system work, screenshots, visual regression, and UI or UX critique.
---

# Streamer UI Quality

Build Streamer UI as one adaptive product across phone, tablet, web, and
Electron. Apply current accessibility, interaction, and platform standards;
reuse the local design system where it supports those standards, and improve it
centrally where it does not.

Read `references/standards.md` for substantial design, responsive, or
accessibility work. Keep routine local changes on this workflow.

## Sources Of Truth

Use this order:

1. The user's required outcome and constraints.
2. Accessibility, safety, and current platform interaction standards.
3. Stable product, compatibility, and ownership contracts in `UI.md`,
   `ARCHITECTURE.md`, `PLAYBACK.md`, and `docs/ELECTRON_SECURITY.md`.
4. The local design system, source, and tests for the affected flow.
5. Existing visual patterns.

Treat the current interface as evidence, not automatically as best practice. If
a local pattern falls below a stronger standard, name the gap and improve the
shared primitive or contract with a safe migration. Do not create a local
exception merely to preserve weak consistency.

Do not restate `UI.md` in new documentation. Update it only when the product
contract changes.

## Specialist Routing

Use this skill as the primary router for every Streamer UI task. Load at most
two specialist skills, and only when the task clearly needs their narrower
guidance:

- Use `vercel-react-native-skills` for Expo or React Native performance, lists,
  animations, safe areas, native modules, images, or native dependency layout.
- Use `web-design-guidelines` only for an explicit web or Electron renderer
  audit against current interface guidelines.
- Use `ui-ux-pro-max` for new design exploration, product-specific design-system
  research, or targeted UX research. Use its search data on demand; never run
  `--persist` unless the user explicitly asks to create or update a design
  system artifact.
- Use `frontend-design` only when the user asks for a distinctive visual
  direction or a deliberately creative redesign.

Use no specialist for a routine component change. For a broad redesign, select
the two specialists that cover the actual risks and state why the combination
is needed. Do not load all four by default.

Resolve disagreements in this order:

1. User outcome and explicit constraints.
2. Security, accessibility, platform, and compatibility requirements.
3. Streamer contracts in `UI.md`, `ARCHITECTURE.md`, `PLAYBACK.md`, and
   `docs/ELECTRON_SECURITY.md`.
4. Shared tokens, primitives, and tested product behavior.
5. Specialist recommendations and general visual preferences.

Treat specialist skills as advisory modules, not competing sources of truth.
`ui-ux-pro-max` must not silently replace `UI.md` or shared tokens;
`frontend-design` must not introduce visual novelty that harms operational
scanability; Vercel rules apply only when their framework and platform context
matches the affected code; web-only checks do not establish native mobile
compliance.

## Workflow

### 1. Establish Context

- Query Graphify for the affected screen, primitives, stores, and tests.
- Read the relevant `UI.md` section and the actual components named by the
  graph. Treat the graph as navigation, not source of truth.
- Inspect `apps/mobile/components/ui/designSystem.ts`,
  `apps/mobile/constants/theme.ts`, and `useWindowClass()` before introducing
  local styling or layout logic.
- For a substantial new screen or redesign, inspect the current rendered app
  and a small number of relevant platform or product references. Extract useful
  interaction and hierarchy patterns; do not copy branding.
- Audit the existing primitive against the standards baseline before reusing it
  in a new context. Improve the primitive centrally when the issue affects all
  consumers.

Write a compact design contract before editing:

- user goal;
- primary action;
- information hierarchy;
- required loading, empty, error, disabled, offline, and success states;
- affected window classes and input methods.

### 2. Design The Experience

- Keep application chrome quiet and let media artwork carry visual energy.
- Prefer scanning, comparison, and repeated action over decorative composition.
- Reuse existing primitives before creating a component. Extend a primitive only
  when the behavior belongs to every consumer and the primitive meets the
  accessibility and interaction baseline.
- Use semantic theme and design-system tokens. Do not add ad hoc colors,
  breakpoints, control geometry, or a parallel styling framework.
- Use the shared window classes for structural adaptation. Do not infer layout
  from platform or device names.
- Keep Play or Resume primary. Keep source and device complexity progressively
  disclosed.
- Preserve keyboard, pointer, touch, screen-reader, reduced-motion, and
  reduced-transparency behavior.
- Use familiar icons for compact commands and label unfamiliar icon-only
  controls accessibly.
- Preserve visible focus, logical reading order, text scaling, safe areas, zoom,
  contrast, target size, and non-color state cues.
- Avoid nested cards, decorative pills, excessive borders, and oversized text
  inside operational surfaces.
- Check text wrapping and control dimensions with realistic long content, not
  only ideal fixtures.

### 3. Implement With Tests

- When behavior changes, use the installed TDD skill: write the smallest useful
  failing test, observe the failure, then implement.
- Keep pure layout and decision logic outside render trees when it can be tested
  independently.
- Cover state transitions and semantics, not implementation details.
- Add or extend golden-path coverage when navigation, hierarchy, responsive
  structure, keyboard behavior, or accessibility changes.
- Add visual baselines only for stable, deterministic product states.
- Do not update screenshots merely to make a regression pass. Inspect and
  approve the difference first.

### 4. Validate Proportionally

Start narrow, then expand according to blast radius:

```bash
npm run typecheck --workspace=apps/mobile
npm run test --workspace=apps/mobile -- --runInBand <focused-test>
```

For changed flows or responsive structure:

```bash
npm run test:golden-path
```

For meaningful visual changes:

```bash
npm run test:visual
```

For Electron shell or security-boundary changes:

```bash
npm run test:electron-smoke
```

Use the existing Playwright projects for phone, tablet portrait, tablet
landscape, and desktop. At minimum, visually inspect phone and desktop output in
both relevant color schemes. Use reduced motion during deterministic capture.

Automated Axe checks cover web semantics and contrast. Do not claim native
VoiceOver, TalkBack, Dynamic Type, safe-area, gesture, or device playback
validation without the relevant simulator or real device.

### 5. Review The Rendered Result

Inspect screenshots or the live app and verify:

- the primary action wins without relying only on color;
- hierarchy remains clear at a glance;
- content density fits the task and viewport;
- text does not clip, collide, or unexpectedly resize controls;
- focus order and visible focus are coherent;
- controls remain reachable and have adequate hit areas;
- loading, empty, error, offline, and disabled states feel intentional;
- light and dark themes preserve contrast and surface hierarchy;
- no horizontal overflow or incoherent overlap appears at any window class.

Fix observed problems before reporting completion.

## Completion Evidence

Report:

- which window classes, themes, and input methods were inspected;
- which focused tests and broader UI commands passed;
- where screenshots or Playwright artifacts were produced;
- any native or device behavior that remains unverified.
