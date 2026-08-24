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
- browser golden paths: `npm run test:golden-path:project`, executed once per
  `phone-web`, `tablet-portrait-web`, `tablet-landscape-web`, and
  `desktop-renderer` project
- committed Linux visual regression: `tests/golden-path/visual-regression.spec.ts`
  on the `phone-web` and `desktop-renderer` projects
- desktop package input smoke:
  `npm run package:check --workspace=@streamer/desktop`
- desktop release signing/notarization config smoke:
  `npm run release:check --workspace=@streamer/desktop`
- Sentry release dry-run: `npm run sentry:release:dry-run`
- dependency install-script policy: `npm run security:install-scripts`
- production high/critical dependency audit: `npm run security:audit`
- release gate: `npm run release:gate`

## Pull Request Scope Selection

Every CI event starts the workflow and runs `ci_scope`. Pull requests use the
detector from the base commit for its fail-closed path classification, so a PR
cannot change the detector and use that change to skip validation. Pushes to
`main`/`master`, merge-group checks, workflow dispatches, missing Git history,
unknown paths, workflow/configuration changes, dependency changes,
shared-package changes, and native/release-sensitive changes always run full
CI. A detector that does not yet exist at the base commit also falls back to
full CI.

Skipped job checks remain present because selection happens at job level, not
with a top-level workflow `paths` filter. `release-gate` validates the scope
detector itself and rejects a detector failure or an unexpected skipped job.
The detector writes its mode, reason, changed-file count, and selected jobs to
the CI job summary.

Draft pull requests use an explicit fast lane: workflow linting, lint/typecheck,
formatting, and the dependency security checks still run, while the expensive
mobile, browser, server, container, build, and desktop jobs remain skipped.
Marking the pull request ready for review emits a `ready_for_review` event and
restores the full dependency/native/release-sensitive matrix. This keeps draft
iteration responsive without weakening the checks required for review or merge.

## Pull Request Readiness

The repository distinguishes three states:

- **Draft:** scope or implementation is still changing; only the draft fast lane
  is expected.
- **Ready for review:** the decision lock is complete, the change-scoped focused
  and final verification ran, and the PR records its evidence boundary.
- **Merge-ready:** the latest commit has all required checks passing and the
  required reviews and branch-protection conditions are satisfied.

The verification receipt must name the latest commit SHA. Checks from an earlier
commit do not establish readiness for the current PR revision.

For a failed run, inspect the first root job failure before interpreting a
downstream or dependent failure. For visual failures, use the platform-matched
comparison evidence and, when present, the **Visual Baseline Candidate** artifact
before changing source-controlled snapshots.

`Ready for review` is a review state, not a claim that the PR is already
merge-ready. Required CI checks and approvals remain the merge authority. The
evidence boundary must state explicitly when browser or Electron coverage does
not prove physical-device behavior.

## Dependency Cache Policy

CI keeps the existing `setup-node` npm cache, keyed by the lockfile. It does
not cache or upload `node_modules`: the repository includes native and
platform-specific dependencies, so sharing installed modules across runners
would weaken reproducibility and can cross OS or architecture boundaries.
Playwright evidence remains job-local and is uploaded with a unique project
artifact name.

## Artifacts

CI uploads:

- `server-coverage`
- per-job Markdown summaries under `ci-summary-*`
- one browser report and summary artifact per Playwright project
- committed Linux visual comparison evidence (`visual-regression-linux-report`)
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

## Merge Queue Readiness

The CI is ready for GitHub's merge queue while the default branch keeps strict
required status checks. Both `CI` and `Dependency Review` listen for
`merge_group.checks_requested`, so queued commits will be tested against the
current default branch and any compatible entries ahead of them in the queue.

GitHub currently limits merge queues to public repositories owned by an
organization. `BBrowns/streamer` is public but owned by the personal `BBrowns`
account, so the `Protect master` ruleset cannot enable the `merge_queue` rule
yet. Until the repository is transferred to an organization, strict required
status checks remain the active protection and merges continue through the
normal pull-request flow. After a transfer, enable the queue with a minimum
group size of 1, a one-minute grouping wait, a maximum group size of 2, a
build concurrency of 2, `HEADGREEN`, and a 60-minute check timeout.

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
