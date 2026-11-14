---
name: streamer-verification
description: Use when the user explicitly asks to verify or test a change, or before completing material, risky, multi-file, cross-workspace, contract, dependency, security, native, release, or process work. Do not activate for read-only analysis, a trivial documentation correction, or an isolated local rename; those may use the verification map directly.
---

# Streamer Verification

Bind completion evidence to the exact task-owned files and run the smallest repository-valid checks.

## Workflow

1. Separate task files from pre-existing work. Never validate or stage unrelated user changes as though they belong to the task.
2. Preview the deterministic plan:

   ```bash
   npm run verify:change -- --plan --files path/one,path/two
   ```

3. Run new or changed behavior red-green at the nearest stable boundary. Read [references/testing.md](references/testing.md) when choosing or repairing non-trivial tests.
4. Before launching the focused or final bundle, inspect the planned commands for generated files and local services they require.

   - For a direct `npm run typecheck --workspace=server`, first generate Prisma Client with `npm run db:generate --workspace=server`. The server test command already generates it through npm's `pretest` lifecycle.
   - Before server tests that use Testcontainers, run `docker info` with the active Docker context or `DOCKER_HOST` configured for the project. This only checks daemon reachability; it does not establish that Testcontainers can pull images or start the suite. A passing server test run is still required. The preflight does not start Docker, create or configure a database, or substitute a development database for the isolated test database.
   - Resolve missing prerequisites before starting an aggregate run: the runner stops at the first failed command. If a prerequisite is unavailable and you leave the bundle unstarted, record its checks as `not-run` with the prerequisite reason in the Gauntlet check inventory. Record the exact command and result of any independent checks you run separately; leave the others `not-run` until executed.

5. Run the focused plan, fix root causes, then rerun it against the final content:

   ```bash
   npm run verify:change -- --focused --files path/one,path/two
   ```

6. For cross-workspace, shared contract, native, security, dependency, or release-level work, run `--final`. The generated receipt fingerprints the supplied files and records every command result.
7. Add environment-dependent evidence only when actually run. Browser/simulator/preflight output does not prove real-device playback, casting, downloads, accessibility, signing, or packaged release behavior.
8. For a development task in the Gauntlet workflow, have Codex snapshot the task-owned files before checks and build the review package from the plan, each receipt/attempt, available structured runner output, and required checks. Keep failed, skipped, planned, and not-run checks in the inventory. Annotate mock-handler, real browser interaction, native, and external evidence separately, with the source and whether the classification was inferred or manually observed. Take the independent source-first review before exposing draft delivery or Gauntlet labels; bind its final disposition to the current candidate, task, evidence, and claims. A missing reviewer is `not-run`. Preserve old candidate reports and allow no more than one review-driven repair round.

## Claims

- Do not infer broader success from a focused check.
- A pass for an old fingerprint does not cover changed content.
- A skipped check stays skipped with a reason and residual risk.
- A completed review is not a project-check pass and may still have open findings.
- A mock callback does not establish an end-to-end browser, native, or external flow, regardless of a broad scope label.
- Tests prove behavior only when the relevant failure was observed or a characterization contract was established before refactoring.

## Completion

Report the supplied files, matched verification rules, fingerprint/revision, focused and final commands with results, skipped evidence, and remaining untested risk.
