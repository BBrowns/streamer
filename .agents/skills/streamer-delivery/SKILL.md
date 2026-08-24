---
name: streamer-delivery
description: Use when the user asks to inspect or prepare Git scope, create a branch, stage, commit, rebase, push, open or update a pull request, check CI, merge, or assemble release evidence. Readiness never implies permission to publish.
---

# Streamer Delivery

Prepare intentional Git, review, CI, and release state from evidence bound to the final task content.

## Authorization

Status, diff, local readiness, and draft text are read-only. Committing, rebasing published work, pushing, opening/updating a PR, merging, releasing, or changing external state requires the user's explicit request for that action.

## Workflow

1. Inspect branch/upstream, base, status, staged/unstaged/untracked files, and the complete task-owned diff. Preserve unrelated user changes.
2. Use `codex/<kebab-case-description>` for a new Codex branch unless the user requests another valid name. Never commit directly to the default branch.
3. Require a current `streamer-verification` receipt for the final task files. Run independent risk review for broad or high-risk changes.
4. Keep commits and PR scope coherent around independently reviewable behavior or contracts. Do not split a producer and consumer into incompatible commits.
5. In a PR or handoff, state outcome, implementation, risk, migration/rollback, exact verification, screenshots/device evidence, skipped checks, and residual risk.
6. Confirm required CI applies to the latest revision. Missing, skipped, stale, or failed required checks are blockers.
7. For release work, run `npm run rc:evidence` and `npm run release:gate`; bind every item to the exact commit/artifact and preserve `unknown` where evidence is absent.

Read [references/delivery.md](references/delivery.md) for release, disputed Git policy, or complex rollout work.

## Completion

Report included files, branch/revision, authorized external actions actually performed, verification and review state, CI/release evidence, blockers, and residual risk. Never invent a commit, PR, device, or release result.
