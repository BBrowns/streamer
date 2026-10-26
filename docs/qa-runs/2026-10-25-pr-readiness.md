# PR readiness follow-up — 2026-10-25

This follow-up starts from current `master` at `979979ae`. The earlier local
consolidation remains recoverable on `codex/consolidated-pending-archive`;
already-merged playback, SDK58, architecture and visual-baseline changes are
not replayed over newer upstream implementations.

## Scope

- Retain portable project-skill overlays, local host configuration, the dated
  platform presentation proposal and the missing FFprobe invalid-JSON fix.
- Preserve an actionable Resume / Start Over choice after an ordinary failed
  confirmed seek. Keep cancellation, source replacement and stale completion
  inert; only confirmed positions may update progress and resume playback.
  Start Over confirms zero even when the failed seek already moved the media;
  a failed reset retains the original Resume position and recovery choice.
- Import overlapping visual captures from multiple Playwright reports without
  overwriting source evidence or colliding destination names. Give repeated
  browser captures unique PNG paths while preserving stable case identifiers.
- Wait for autoplay and the resulting paused media and Play control before
  capturing Player visuals, so slow Linux initialization cannot skip the pause.
- Resolve body-parser 2.4.0 and require the Zod 4.6.7 floor without changing
  native/framework versions, install approvals or audit policy. The existing
  verified node-forge patch remains documented in DEPENDENCY_SECURITY.md.

## Required evidence

The local verification package records the exact selected-file fingerprint,
commands, failed attempts, final results and independent review phases. Its
location is recorded in `artifacts/pr-readiness-2026-10-25/run-path.txt`; these
local logs are intentionally excluded from Git. The PR description must state
actual results rather than treating this checklist as an execution receipt.
The original candidate and its source-first review remain preserved; the
2026-10-26 follow-up uses one bounded repair round for Start Over and the
Linux Player setup race, with an expanded 48-file baseline before edits.

- Process/runtime/hooks, formatting, lint, architecture and all typechecks.
- Mobile, shared, stream-server and server tests, with isolated disposable
  PostgreSQL for database-dependent suites.
- Dependency compatibility, install policy, production audit and focused
  remediation regressions.
- Golden paths, phone/desktop visual comparisons and Linux-specific browser
  output, using the existing approved platform baselines.
- Source-first independent risk review and candidate-bound visual review.

## Evidence boundaries

Browser fixture playback, synthetic ranges and emulator evidence do not prove
physical-device playback, casting, providers, accessibility hardware behavior,
signing or release readiness. This PR does not introduce native dependencies
or claim new device support. Any unavailable target stays explicitly unrun.
