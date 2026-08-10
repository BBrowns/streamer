---
name: streamer-test-strategy
description: Use when planning, writing, reviewing, or repairing tests for a feature, bug fix, refactor, contract, migration, flaky test, or untested behavior. Trigger for TDD, choosing unit versus integration versus end-to-end coverage, test doubles, regression tests, test data, quality gates, and claims that a change is verified.
---

# Streamer Test Strategy

Build confidence with the smallest stable set of tests that proves the behavior
and its important failure modes. Use risk, not arbitrary coverage targets, to
choose test layers.

Read `references/standards.md` before changing a broad test strategy.

## Relationship To Other Skills

- When available, use the test-driven-development skill for strict
  red-green-refactor execution.
- When available, use systematic-debugging before guessing at a failing test's
  cause.
- When available, use verification-before-completion before claiming success.
- Use this skill to choose the risk model, test boundaries, matrix, and
  repository commands around those workflows.

## Core Rules

- Test observable behavior and contracts, not private implementation details.
- Put each behavior at the lowest stable boundary that can prove it.
- Use integration tests where confidence depends on serialization, persistence,
  process, network, or framework behavior.
- Use end-to-end tests only for critical journeys and cross-boundary wiring.
- Prefer realistic dependencies that are cheap and deterministic. Replace
  uncontrollable third parties at their boundary.
- Keep tests isolated, deterministic, independently runnable, and explicit
  about time, randomness, locale, network, and data.
- Use generative tests when the contract is an invariant over a broad input or
  transition space; keep example tests for named product cases and regressions.
- Do not accept a snapshot as the only assertion for meaningful behavior.
- Do not weaken or delete a valid assertion merely to make a suite pass.

## Workflow

### 1. Define The Risk

State:

- behavior or invariant being changed;
- observable success and failure;
- regression risk and blast radius;
- boundaries involved;
- cases where corruption, data leakage, privilege escalation, or irreversible
  side effects could occur.

Create a compact test matrix. Include only relevant dimensions such as:

- happy path;
- validation and malformed input;
- boundary values and empty state;
- authorization or trust boundary;
- timeout, retry, cancellation, and partial failure;
- duplicate, reordered, or concurrent events;
- compatibility with existing data or consumers;
- accessibility and responsive behavior.

### 2. Start Red

- Add the smallest useful failing test before production behavior.
- Run it and confirm it fails for the intended reason.
- For a bug, reproduce the root cause at the nearest stable boundary.
- Avoid a test that passes against the old behavior or fails because of fixture
  setup unrelated to the requirement.

If a pure refactor intentionally preserves behavior, establish a passing
characterization test first, then refactor without changing that contract.

### 3. Make It Green And Refactor

- Implement only enough behavior to pass the new test.
- Run the focused test after each meaningful step.
- Refactor production and test code while preserving observable behavior.
- Keep fixtures small and intention-revealing.
- Prefer fakes for stateful dependencies and spies only when the interaction is
  itself the contract.

### 4. Broaden Confidence

Run checks in expanding rings:

1. New or changed focused test.
2. Affected file or package suite.
3. Typecheck and lint for changed owners and consumers.
4. Contract or integration tests for crossed boundaries.
5. Golden-path, browser, native, or release checks when the risk requires them.

Investigate flaky behavior. Do not hide it with sleeps, large timeouts, retries,
or broad mocks unless the underlying nondeterminism is understood and the
mitigation is justified.

### 5. Use Generative Tests Selectively

Consider property-based or model-based testing for parsers, schemas,
normalization, redaction, serialization round-trips, state machines, retries,
cancellation, ordering, and concurrency. Start with one or two high-value
properties against a pure or controlled boundary.

- State the invariant before selecting a generator.
- Constrain generated data to the real contract while preserving adversarial
  boundaries and malformed cases where relevant.
- Keep runs deterministic with a reported seed and replay path.
- Preserve minimized failures as regression examples when they describe a real
  product case.
- Do not use generators to obscure expected behavior or inflate test counts.
- Add `fast-check` only after a focused property demonstrates value; do not make
  it a repository-wide default.

## Streamer Test Matrix

- `packages/shared`: focused shared tests and typecheck, then affected producers
  and consumers.
- `server`: unit tests plus `npm run test:server:integration` for persistence or
  real database behavior. Use only the isolated disposable test database flow.
- `apps/mobile`: focused Jest tests and workspace typecheck. Run
  `npm run test:golden-path` for changed user journeys and responsive structure.
- Meaningful UI visuals: run `npm run test:visual` and inspect the output.
- `apps/desktop`: focused Node tests and `npm run test:electron-smoke` for shell,
  preload, IPC, or renderer integration.
- `packages/stream-server`: workspace tests, typecheck, and focused bridge or
  runtime checks.
- Cross-workspace changes: finish with `npm run verify:quick`; use
  `npm run verify:full` for release-level validation.
- Cross-boundary resilience changes: verify bounded timeout and retry behavior,
  cancellation, duplicate or reordered delivery, partial failure, recovery, and
  degraded user behavior. Keep fault injection deterministic and minimize its
  blast radius.

Do not claim real-device playback, download, casting, VoiceOver, TalkBack, or
native bridge behavior without the relevant device, simulator, or runtime.

## Completion Evidence

Report:

- the behavior and failure modes covered;
- the red failure observed;
- focused and broader commands run;
- any skipped environment-dependent checks and why;
- remaining untested risk.
