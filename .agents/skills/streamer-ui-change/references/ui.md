# UI Quality Standards Baseline

Use these principles before copying an existing local pattern.

## Interaction And Hierarchy

- Make the primary user goal visually and semantically clear.
- Follow platform conventions for navigation, controls, focus, and system
  feedback unless the product has a tested reason to differ.
- Keep controls stable across loading and dynamic content.
- Represent loading, empty, error, offline, disabled, permission, and success
  states intentionally.
- Prefer progressive disclosure over exposing expert complexity in the primary
  path.

## Accessibility

- Meet WCAG 2.2 AA for web-rendered experiences where applicable.
- Preserve semantic roles, accessible names, reading order, and state.
- Support keyboard, pointer, touch, screen reader, zoom, text scaling, reduced
  motion, and high-contrast needs.
- Do not rely on color alone. Keep visible focus and sufficient contrast.
- Provide adequate target size and spacing without hiding essential controls.
- Test with realistic long text, localization pressure, and dynamic content.

Automated checks are necessary but not sufficient. Verify rendered behavior and
state transitions with the relevant platform tools.

## Responsive And Adaptive Design

- Adapt to available space and input method, not device-name assumptions.
- Define stable layout constraints for toolbars, grids, media, and controls.
- Preserve information hierarchy across compact and expanded layouts.
- Avoid horizontal overflow, clipped text, overlap, and viewport-dependent font
  scaling.
- Respect safe areas, window resizing, orientation, and system UI.

## Specialist Baselines

Apply these concise baselines when the router selects a specialist. Read the
specialist skill for its detailed rules; do not copy its full rule catalog into
this reference.

### React Native And Expo

- Treat list and scroll performance as a primary mobile risk.
- Keep render work, callbacks, images, and subscriptions stable where profiling
  shows they affect responsiveness.
- Use platform-safe layout, keyboard, safe-area, animation, and native-module
  patterns that match the installed Expo and React Native versions.
- Do not adopt a library-specific rule, such as replacing a list implementation,
  without checking the actual dependency graph, feature needs, and measured
  behavior.

### Web And Electron Audits

- Check semantic structure, accessible names, focus visibility, keyboard paths,
  form feedback, reduced motion, responsive overflow, and image dimensions.
- Treat the fetched web guideline set as an audit input, not permission to cross
  Electron's origin, preload, IPC, or navigation boundaries.
- Report findings with exact file and line evidence when the audit tool requires
  it. Do not infer native accessibility compliance from web markup.

### Creative Direction

- Ground the visual direction in the product's subject, audience, and task.
- Make one or two deliberate differentiating choices, then keep supporting
  layout, type, motion, and decoration disciplined.
- Match visual complexity to the product surface. Operational media flows need
  hierarchy and scanability before novelty.
- Preserve real content, responsive behavior, focus, reduced motion, and the
  existing product contract while exploring style.

## Precedence

Generic specialist guidance is subordinate to the project contract and measured
behavior. When a recommendation conflicts with a local rule, record the gap,
explain the tradeoff, and choose a migration only when the user outcome and
validation support it.

## Primary References

- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design accessibility](https://m3.material.io/foundations/accessible-design/overview)
- [React Native accessibility](https://reactnative.dev/docs/accessibility)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
