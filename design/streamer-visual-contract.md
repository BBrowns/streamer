# Streamer visual review contract

This contract guides the subjective review of rendered Streamer screens.
`UI.md` remains authoritative for product direction, interaction behavior,
accessibility, tokens, and implementation patterns. This file adds a compact
review lens; it does not define a second component system.

## Visual philosophy

- Typography before containers.
- Spacing before borders; borders before shadows.
- A card needs a functional reason, such as interaction ownership, meaningful
  grouping, modality, or state. Lists and sections are not collections of
  rounded cards by default.
- Prefer a larger continuous surface. Use hierarchy through typography,
  whitespace, alignment, and restrained dividers.
- Keep radii and decoration quiet. Preserve purposeful containment and the
  existing Living Cinema direction in `UI.md`.

## Anti-patterns to flag when material

- Cards inside cards, repeated rounded containers, or a separate surface for
  every row without a functional reason.
- Excessive padding or low information density that weakens scanning.
- Weak or inconsistent alignment and spacing that obscures grouping.
- Typography that gives metadata, labels, or decoration the same weight as the
  primary content.
- Pills and badges used as decoration rather than to communicate state.
- Arbitrary shadows, gradients, borders, or radii that do not express hierarchy
  or interaction.
- Generic AI-generated SaaS or dashboard patterns that conflict with the
  screen's media task and the project's established visual direction.

## Review and findings

Review the exact candidate-bound screenshots against this contract and `UI.md`.
Report zero findings when no concrete contract violation or material visual
problem is visible. Do not invent cosmetic criticism to fill a quota. Do not
apply numeric thresholds to card counts or other subjective choices.

Each finding must identify its stable screenshot evidence and describe the
smallest appropriate repair. Use `P1` only when the issue requires a bounded
repair; use `P2` for useful information that does not require repair. The
categories are hierarchy, cardification, density, spacing-alignment,
typography, nested-surfaces, decoration, and generic-pattern.

A visual review records the SHA-256 contract version over the exact bytes of
this file and `UI.md`, in sorted path order, using the existing
`sha256-path-nul-content-nul-v1` framing. A content change changes the review
identity.
