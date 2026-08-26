# Streamer Agent Handoff

> Last updated: 2026-08-26.
> Audience: humans and agents continuing Streamer product, playback, release,
> or process work.

This file is intentionally short. It records only current operating context;
completed work and historical decisions remain available through Git and the
canonical documents linked below.

## Current Project Phase

Streamer is in post-v3 hardening, productization, and release-evidence work.
The playback architecture is complete enough for this phase: keep
`PlaybackSession`, Planner v3, the session-owned prepared-source lease, and the
platform media adapters as the control path. Do not introduce another playback
control plane.

Planner v2 remains an isolated compatibility path until its documented 30-day
no-fallback removal condition is met. Bridge, playback, download, cast, and
telemetry work must continue to preserve the repository's URL-free persistence
and redaction rules.

The supported toolchain is Node 26.7.0 and npm 12.0.2. Root package metadata is
the source of truth for projected runtime pins.

## Active Work

The active production-convergence branch at this handoff is
`codex/living-cinema-convergence`, based on the then-current `origin/master`.
It contains the reviewed Living Cinema convergence slices and preserves
existing ownership, routing, playback, provider, download, cast, source-safety,
and offline contracts. The original dirty checkout and the earlier broad
`codex/living-cinema` worktree remain separate; do not clean, reset, or stage
either one indiscriminately.

The current UI direction includes adaptive cinema surfaces, a horizontal
desktop top bar, full-bleed Home and Detail layouts, responsive Search, Player,
Cast, Settings and utility screens, bounded dynamic ambience, resilient media
artwork, and system/interface typography with display titles. Capability and
ownership boundaries remain more important than visual consistency.

The narrow Living Cinema finishing pass now also covers true 16:9 Continue
Watching cards with contained legacy-poster fallback, per-title progress
colour, a continuous Home hero fade, sticky topbar scroll state, compact Detail
actions and source disclosure, command-search/live result behavior, adaptive
desktop forms, soft profile and notification popovers, semantic page widths,
and quieter utility rows. Preserve these as shared presentation contracts; do
not reintroduce route-local sidebars, full-width desktop sheets, or permanent
quick-action chrome.

The finishing pass also closes the intermediate-width Detail/topbar overlap,
keeps Continue Watching actions stable across pointer transitions, scopes
artwork ambience to the focused route, refreshes overlay focus targets after
dynamic content swaps, and localizes Player Settings copy and accessibility
labels.

The final correction pass keeps control focus at three pixels but gives media
artwork a distinct two-pixel active-palette ring, carries the current palette
through Home/Detail actions and progress, moves the legacy Continue Watching
poster to an ambient edge, and labels command Search's final row with the known
result count. These are polish contracts, not a new navigation or component
architecture.

The contained convergence pass has completed its production slices: semantic
FloatingSurface levels and AdaptiveOverlay infrastructure, command-search
ownership, removal of the global `/` shortcut, selective utility flattening,
shared interaction-state harmonisation, terminology cleanup, evidence-backed
legacy presentation removal, and risk-based golden-path assertions. Step 9,
the asymmetrical Continue Watching experiment, has intentionally not started
and must remain a separate branch/worktree and approval.

The same worktree also contains a compact repository-skill redesign. Its nine
skills, registry, activation fixtures, process validators, maintenance scripts,
runtime policy and changed-file verification are process infrastructure. Keep
that scope separate from the product diff.

## Release Blockers

- Real-device playback, downloads, casting, recovery, accessibility, and
  responsive behavior still need evidence on supported iPhone and Android
  targets. Simulator or browser evidence must not be promoted to a physical
  device claim.
- Packaged macOS, browser, mobile preview, signing/notarization, SBOM,
  provenance, and rollback evidence must be attached to the exact release
  commit and artifacts before a release-ready decision.
- The QA matrix and RC checklist remain authoritative. Record unavailable
  evidence as blocked or unknown instead of inferring success.
- Keep production dependency audits and install-script policy green. Do not
  bypass the runtime guard to work around native architecture mismatches.

## Next Actions

1. Finish and verify the process-skill redesign against explicit process-owned
   files without absorbing unrelated Living Cinema changes.
2. Keep the exact-file Living Cinema verification receipt current with each
   reviewed convergence commit and any remaining visual finding.
3. Run the documented browser and simulator flows, preserving the distinction
   between automated evidence and real-target evidence.
4. Execute the QA matrix on packaged macOS, browser, iPhone, and Android when
   the required hardware and credentials are available.
5. Do not begin the separate Continue Watching experiment until production
   convergence is reviewed and explicitly approved.

## Canonical Sources

- [ROADMAP.md](./ROADMAP.md) — implemented roadmap and remaining priorities.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — ownership and service boundaries.
- [PLAYBACK.md](./PLAYBACK.md) — playback session and stream contracts.
- [UI.md](./UI.md) — adaptive UI and Living Cinema behavior.
- [docs/QA_MATRIX.md](./docs/QA_MATRIX.md) — target-by-target evidence status.
- [docs/RC_CHECKLIST.md](./docs/RC_CHECKLIST.md) — release decision inputs.
- [docs/DEPENDENCY_SECURITY.md](./docs/DEPENDENCY_SECURITY.md) — dependency and
  install-script policy.
- [docs/AUTOMATED_GOLDEN_PATHS.md](./docs/AUTOMATED_GOLDEN_PATHS.md) — browser
  and visual regression coverage.
