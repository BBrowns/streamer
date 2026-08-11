---
name: streamer-delivery-readiness
description: "Use when preparing work for review or release through Git: inspecting scope, creating a branch, staging, committing, rebasing, pushing, opening or updating a pull request, checking CI, or assembling release evidence. Trigger for Git hygiene, commit structure, PR readiness, merge readiness, release readiness, and verification receipts."
---

# Streamer Delivery Readiness

Deliver intentional, reviewable, reversible changes with evidence proportional
to their risk. A clean command exit is not proof that the right code was tested
or that the intended files were committed.

Read `references/standards.md` for pull-request or release readiness, policy
changes, or disputed Git practice. Skip it for a simple status inspection.

## Relationship To Other Skills

- When available, use verification-before-completion before a success claim.
- When available, use finishing-a-development-branch when choosing how to
  integrate completed work.
- When available, use the GitHub `yeet` skill when the user explicitly asks for
  the complete commit, push, and draft-PR flow.
- When available, use `gh-fix-ci` for failing GitHub Actions and
  `gh-address-comments` for actionable review feedback.
- This skill owns local scope, readiness, repository-specific gates, and the
  final evidence receipt.

Never commit, push, rewrite history, or open a pull request unless the user has
asked for that action. Readiness checks do not imply permission to publish.

## Workflow

### 1. Inspect Scope

- Check branch, upstream, status, staged diff, unstaged diff, and untracked
  files.
- Separate task changes from pre-existing user work.
- Confirm the base branch and whether remote changes affect the comparison.
- Identify generated artifacts, lockfile churn, migrations, secrets, binaries,
  and unusually large files.
- Review the actual diff, not only filenames or a generated summary.

Do not stage or modify unrelated changes. Do not discard user changes to obtain
a clean tree.

### 2. Build The Readiness Matrix

Classify the change by affected behavior and risk:

- package-local implementation;
- shared contract or cross-workspace behavior;
- persistence or migration;
- security or dependency boundary;
- UI, browser, native, or Electron runtime;
- release configuration or evidence.

Map each class to focused tests, broader gates, documentation, migration,
rollback, and reviewer needs. Run narrow checks first so failures are
diagnosable.

### 3. Prepare Commits

- Use a `codex/` branch unless the user requests another name.
- Keep each commit coherent and independently understandable.
- Prefer small reversible commits, but do not split changes that would leave a
  broken contract between commits.
- Stage exact paths or hunks after reviewing them.
- Write an imperative commit subject that describes the behavior or intent.
- Explain non-obvious motivation and consequences in the body.
- Do not claim tests, compatibility, or security review that was not performed.

Avoid rewriting published history or force-pushing unless the user explicitly
requests it and the ownership and impact are understood.

### Slice Conceptual Changes

- Split work at independently understandable behavior or contract boundaries,
  not arbitrary file boundaries.
- Every slice must have a bounded outcome, verification evidence, and a safe
  relationship to the preceding slice. Do not merge a slice that leaves a
  producer and consumer on incompatible contracts.
- Keep repair, refactor, migration, rollout, and cleanup distinguishable when
  combining them would make review or rollback ambiguous.

### 4. Prepare The Pull Request

Include:

- problem and user-visible outcome;
- implementation and architecture notes;
- risk, migration, and rollback;
- exact verification performed;
- screenshots or runtime evidence for meaningful UI changes;
- skipped checks and residual risk;
- linked issue or decision record when available.

Keep the pull request focused enough to review. Request specialist review for
security boundaries, shared contracts, migrations, release automation, and
platform-native behavior.

### 5. Verify Remote State

- Push the intended branch and confirm its upstream.
- Confirm the PR base and head.
- Check that required status checks apply to the latest commit.
- Resolve merge conflicts without discarding unrelated work.
- Treat skipped or missing required checks as blockers, not success.
- Do not bypass branch protections or approvals to make a readiness claim.

### 6. Assemble Release Evidence

For a release candidate, bind every receipt to the exact commit and artifact.
Record each required item as passed, failed, not run, or not applicable with a
reason:

- focused tests and repository verification gates;
- dependency, install-script, and security checks;
- migrations, configuration, compatibility, and rollback rehearsal;
- golden-path, visual, Electron, native, and real-device evidence where
  applicable;
- Sentry release and source-map dry-run or equivalent observability evidence;
- known limitations, deferred risk, owner, and follow-up date.

Run `npm run rc:evidence` when assembling the repository evidence bundle. Check
the bundle contents and revision rather than treating successful generation as
proof that every requirement passed. Do not infer production or device
readiness from a simulator, browser, or absent signal.

### Rollout And Temporary Paths

For a high-risk or staged change, record the rollout cohort, owner, observation
window, abort threshold, rollback action, and cleanup condition. A feature flag,
adapter, dual path, audit exception, or compatibility shim is incomplete until
its removal owner and evidence-based exit condition are recorded.

Do not add a feature flag to routine local work merely to satisfy this section.
Use a reversible deployment or a small PR when that is sufficient.

Give a go, conditional go, or no-go recommendation from this matrix. A
conditional go must name the accepted risk, owner, expiry, and recovery action.

## Streamer Adapter

- Do not stage `graphify-out/` by default; it is generated local context.
- Refresh Graphify after code changes without treating graph artifacts as
  deliverables.
- Run focused workspace tests and typechecks first.
- Use `npm run verify:quick` for cross-workspace or higher-risk changes.
- Use `npm run verify:full` for release-level confidence when the environment
  supports it.
- Run isolated server integration tests for persistence changes.
- Run golden-path and visual checks for meaningful UI flows.
- Run Electron smoke and security checks for desktop boundary changes.
- Run `npm run release:gate` and the repository evidence flow before a
  release-ready claim.
- Run `npm run sentry:release:dry-run` when release observability or source maps
  changed; publishing the Sentry release still requires explicit authorization.
- Update the relevant architecture, playback, UI, environment, or release
  documentation when its durable contract changes.

## Completion Evidence

Report:

- branch and exact files included;
- commit or PR identifiers only after successful creation;
- focused and broader checks run with results;
- CI and review state;
- release artifact, evidence-matrix status, and go/no-go recommendation when
  applicable;
- skipped checks, blockers, and residual risk.
