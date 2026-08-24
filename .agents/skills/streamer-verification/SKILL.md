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
4. Run the focused plan, fix root causes, then rerun it against the final content:

   ```bash
   npm run verify:change -- --focused --files path/one,path/two
   ```

5. For cross-workspace, shared contract, native, security, dependency, or release-level work, run `--final`. The generated receipt fingerprints the supplied files and records every command result.
6. Add environment-dependent evidence only when actually run. Browser/simulator/preflight output does not prove real-device playback, casting, downloads, accessibility, signing, or packaged release behavior.

## Claims

- Do not infer broader success from a focused check.
- A pass for an old fingerprint does not cover changed content.
- A skipped check stays skipped with a reason and residual risk.
- Tests prove behavior only when the relevant failure was observed or a characterization contract was established before refactoring.

## Completion

Report the supplied files, matched verification rules, fingerprint/revision, focused and final commands with results, skipped evidence, and remaining untested risk.
