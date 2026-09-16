# CI Release Gates

Streamer CI is intended to make release readiness visible instead of relying on
agent memory.

## Required Checks

Every CI event also runs the process-evidence job. It validates process assets,
their tests, workflow policy, runtime selection, and the change-verification
receipt contract. Release Gate depends on that job, so a missing or failed
process check cannot be hidden behind a skipped downstream job.

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
- dependency install-script policy and reproducible install:
  `npm run ci:install` (runs `security:install-scripts`, `npm ci --ignore-scripts`,
  and the reviewed `postinstall` patch step)
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

Dependency-sensitive pull requests also run `Dependency Install Preflight`
before the installer-bearing matrix. It checks the pinned install-script policy
and performs a non-mutating npm lockfile/manifest install validation. When it
fails or is cancelled, dependent jobs are intentionally skipped and `Release
Gate` reports the preflight as the root outcome; a successful preflight leaves
each runner's isolated install unchanged. A skipped preflight is accepted only
when the trusted scope detector explicitly marks the install contract out of
scope.

During the rollout, if the trusted base-branch scope detector does not yet
publish the preflight output, the workflow fails closed by enabling one
preflight rather than silently skipping the install contract.

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

`verify:change` writes a JSON receipt under `artifacts/verification/` for every
focused or final run. The receipt records the exact files, selected rules,
commands that ran, and every command that was not run after a failure. QA runs
use a JSON manifest with a generated Markdown view under the same artifact
boundary; manual network/device records remain under `docs/qa-runs/`.

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

## Required Check Contract

`.github/required-checks.json` records the protected contexts that must remain
stable: `Release Gate`, `Review Dependency Changes`, and the external aggregate
`CodeQL` context. `npm run workflows:check` verifies that repository-owned
contexts still have one unambiguous workflow publisher and that the external
CodeQL context is not shadowed by a local job. The maintenance collector also
reconciles the active remote ruleset when its details are available; the static
check remains useful for local changes but cannot observe a manual remote edit.

The read-only maintenance artifact records only bounded aggregate evidence:
open PRs, Dependabot PRs, active and historical CI outcomes, reruns, sampled
queue and execution duration, preflight outcomes, and skipped downstream jobs.
Preflight job outcomes are sampled from at most 20 recent CI runs so the weekly
radar remains bounded when the repository has a large run history; every such
metric is labeled as sampled in the report.
Failures are considered active only when they belong to an open pull request's
head revision or the latest protected-branch run; superseded failures remain
available for trend analysis under `Watch`. The maintenance protocol reduces
analysis cost by batching metadata reads, fetching only the first root failure,
and reusing the compact PR inventory. It does not restore the removed
`streamer-maintenance-radar` skill; the collector, report, and recurring
read-only automation are the authoritative maintenance path.

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

Every workflow job has a finite `timeout-minutes` value. Server CI applies the
committed Prisma migrations with `prisma migrate deploy`; `db push` remains a
deliberate local-development command only. The CI install helper keeps
lifecycle scripts disabled and rebuilds only the allow-listed
`node-datachannel` native addon after patch application.
