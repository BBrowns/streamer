# Skill evaluation

These cases test routing precision independently from implementation quality.
They contain positive, conditional, and non-activation expectations derived
from recurring Streamer work.

## Protocol

1. Give an independent capable coding agent only `AGENTS.md`, each current
   `streamer-*` skill description, and the scenario prompts from
   `activation-cases.jsonl`.
2. Do not expose the expected arrays, registry, or prior result.
3. Ask for immediate and conditional repository-local skill activations.
4. Record the classifications in `activation-result.json` and update its
   activation-surface fingerprint.
5. Run `npm run process:check:test`.

The validator rejects stale routing surfaces, missed required activations,
unexpected activations, unknown skills, contradictory classifications, and
incorrect summary metrics. It validates the recorded benchmark contract; it
does not pretend that a static fixture replaces a fresh model run.

The initial redesign benchmark reduced direct activation edges from 22 to 11
and total direct-plus-conditional edges from 37 to 26 across the representative
suite while retaining direct coverage of all nine repository skills.

Workflow and outcome quality remain covered by repository regression tests,
changed-file verification receipts, review findings, and real target evidence.
Activation success alone is not evidence that an implementation is correct.

## Outcome A/B evaluation

Run `npm run skills:eval:ab` to execute the change-design, shared-contract,
reliability, and adaptive-UI fixtures once with repository skills enabled and
once with them disabled. Each run receives the same prompt and fixture in an
isolated temporary workspace. The disabled copy removes repository skills and
neutralizes the Tool Routing and Development Cycle routing sections while
leaving project rules intact.

The runner records deterministic acceptance-test results, changed files, scope
violations, whether the required verification and expected skill were observed,
duration, token usage when exposed by Codex, and raw JSONL evidence. Results go
to `.agents/evals/results/<timestamp>/`, which is intentionally gitignored.

Use `--model`, repeated `--case`, `--runs`, or `--output-dir` to make an
on-demand comparison explicit. Real runs consume model quota and remain
advisory; they are not part of CI or the release gate. Runner behavior itself
is covered with a fake Codex executable in `process:check:test`.
