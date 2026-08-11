# CI Release Gates

Streamer CI is intended to make release readiness visible instead of relying on
agent memory.

## Required Checks

The release gate expects the workflow to run:

- formatting: `npm run format:check`
- all-workspace typecheck: `npm run typecheck:all`
- shared tests: `npm run test --workspace=@streamer/shared`
- server tests with coverage and Postgres:
  `npm run test --workspace=server -- --coverage`
- stream-server tests: `npm run test --workspace=@streamer/stream-server`
- mobile Jest tests: `npm run test --workspace=apps/mobile -- --runInBand`
- desktop package input smoke:
  `npm run package:check --workspace=@streamer/desktop`
- desktop release signing/notarization config smoke:
  `npm run release:check --workspace=@streamer/desktop`
- Sentry release dry-run: `npm run sentry:release:dry-run`
- dependency install-script policy: `npm run security:install-scripts`
- production high/critical dependency audit: `npm run security:audit`
- release gate: `npm run release:gate`

## Artifacts

CI uploads:

- `server-coverage`
- per-job Markdown summaries under `ci-summary-*`
- `desktop-macos-package-dir`, an unsigned macOS Electron package directory
- `streamer-desktop-macos-release`, a signed DMG/ZIP release bundle with a
  production-only SPDX SBOM and release notes

The desktop artifact is a smoke/review artifact, not a distributable release.
Signing and notarization config is validated by CI, but the pull-request
artifact remains unsigned. Real DMG/ZIP release publishing requires Apple
secrets and follows [MACOS_RELEASE.md](./MACOS_RELEASE.md). The manual
`Desktop Release` workflow validates the release config, runs
`npm run package:mac:release --workspace=@streamer/desktop`, checks DMG/ZIP
inventory, generates `npm run release:sbom`, uploads
`streamer-desktop-macos-release` with the SBOM and release notes, and can create
a draft GitHub Release. Update feeds remain separate release work.

## Merge Queue

The default branch is intended to use GitHub's merge queue with strict required
status checks. Both `CI` and `Dependency Review` listen for
`merge_group.checks_requested`, so queued commits are tested against the
current default branch and any compatible entries ahead of them in the queue.

Queue policy:

- keep `Release Gate`, `Review Dependency Changes`, and CodeQL analysis required;
- use a small merge group for compatible low-risk maintenance changes;
- keep native framework upgrades, security fixes, and process changes separate;
- do not bypass the queue or weaken strict status checks to avoid a rebuild.

The dependency review workflow supplies the merge group's base and head SHAs
explicitly because a merge-group event has no pull-request base/head context.

## Gate Policy

`npm run release:gate` validates:

- required CI commands and artifact uploads are still present
- `AGENT_HANDOFF.md` links to the QA matrix
- `AGENT_HANDOFF.md` names the current project phase and starts the active
  roadmap at PR #143
- `docs/QA_MATRIX.md` still carries explicit release blockers while real-device
  coverage is incomplete
- production defaults do not enable development bridge supervision, development
  CORS, or development Sentry capture
- redaction/Sentry/security tests that guard raw URLs, magnets, local paths, and
  tokens still exist
- Node/npm versions, install-script review policy, and the blocking production
  dependency audit remain configured
- desktop updates remain manual unless the release docs and tests are updated
  together

The gate is intentionally conservative. If a future PR makes the app genuinely
release-ready, update the QA matrix and release gate together with the evidence
that supports the new claim.
