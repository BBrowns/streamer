# Streamer Agent Handoff

> Last updated: 2026-08-24.
> Audience: humans and agents continuing Streamer product, playback, release,
> or process work.

This file intentionally records only current operating context. Completed work
and historical decisions remain available through Git and the canonical
documents linked below.

## Current Project Phase

Streamer is in post-v3 hardening, productization, and release-evidence work.
Keep `PlaybackSession`, Planner v3, the session-owned prepared-source lease, and
the platform media adapters as the control path. Do not introduce another
playback control plane.

Planner v2 remains an isolated compatibility path until its documented 30-day
no-fallback removal condition is met. Bridge, playback, download, cast, and
telemetry work must preserve the repository's URL-free persistence and
redaction rules.

The supported toolchain is Node 26.7.0 and npm 12.0.2. Root package metadata is
the source of truth for projected runtime pins.

## Active Work

The current process change replaces overlapping repository skills with nine
bounded workflow skills, a checked registry, activation and outcome fixtures,
and explicit routing in `AGENTS.md`. Generic API documentation remains an
external capability instead of a repository-local skill.

Changed-file verification is driven by `config/verification-map.json`. Focused
and final runs emit versioned receipts bound to the task files, repository
revision, verification-map fingerprint, runtime, commands, and durations.

The maintenance collector now has a stable repository-owned location. Runtime
hooks, EAS profiles, the desktop vendored runtime, and workflow npm pins are
validated against root package metadata. Skill outcome A/B evaluation remains
manual and writes raw evidence to a gitignored result directory.

## Release Blockers

- Real-device playback, downloads, casting, recovery, accessibility, and
  responsive behavior still need evidence on supported iPhone and Android
  targets. Simulator or browser evidence is not physical-device evidence.
- Packaged macOS, browser, mobile preview, signing/notarization, SBOM,
  provenance, and rollback evidence must be attached to the exact release
  commit and artifacts before a release-ready decision.
- The QA matrix and RC checklist remain authoritative. Record unavailable
  evidence as blocked or unknown instead of inferring success.
- Keep production dependency audits and install-script policy green. Do not
  bypass the runtime guard to work around native architecture mismatches.

## Next Actions

1. Review and merge the repository-skill and changed-file verification change.
2. Use exact-file verification receipts for subsequent implementation work.
3. Run documented browser and simulator flows without promoting them to
   real-target evidence.
4. Execute the QA matrix on packaged macOS, browser, iPhone, and Android when
   the required hardware and credentials are available.
5. Generate release-candidate evidence for the exact commit and artifacts,
   then make the go/no-go decision from the RC checklist.

## Canonical Sources

- [ROADMAP.md](./ROADMAP.md) — implemented roadmap and remaining priorities.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — ownership and service boundaries.
- [PLAYBACK.md](./PLAYBACK.md) — playback session and stream contracts.
- [UI.md](./UI.md) — adaptive UI behavior and visual contracts.
- [docs/QA_MATRIX.md](./docs/QA_MATRIX.md) — target-by-target evidence status.
- [docs/RC_CHECKLIST.md](./docs/RC_CHECKLIST.md) — release decision inputs.
- [docs/DEPENDENCY_SECURITY.md](./docs/DEPENDENCY_SECURITY.md) — dependency and
  install-script policy.
- [docs/AUTOMATED_GOLDEN_PATHS.md](./docs/AUTOMATED_GOLDEN_PATHS.md) — browser
  and visual regression coverage.
