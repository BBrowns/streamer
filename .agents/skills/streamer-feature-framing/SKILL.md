---
name: streamer-feature-framing
description: Use before planning a material feature, ambiguous bug fix, broad refactor, component reshaping, or product change when the desired outcome, audience, success measure, scope, or constraints are not already decision-complete. Frame the user outcome and smallest coherent slice without assuming the current architecture is correct; skip for trivial fixes and fully specified implementation tasks.
---

# Streamer Feature Framing

Frame the outcome before selecting a solution. Make the problem, evidence,
constraints, and definition of done explicit so planning starts from intent
rather than from the first plausible code change.

## When To Skip

- Skip when the user supplied a complete, testable specification and no
  material product, architecture, security, or rollout decision remains.
- Skip for typos, isolated test repairs, mechanical formatting, and other
  changes whose behavior and scope are already obvious.
- Use `research-before-planning` first when the user explicitly asks for
  current external research. Research is evidence for framing, not a
  substitute for deciding the product outcome.

## Workflow

### 1. State The Outcome

- Identify the user, operator, or downstream consumer and the context in which
  the change matters.
- Describe the problem in observable terms and record the evidence already
  available. Separate facts, assumptions, and open questions.
- State the desired behavior and why it matters. Avoid solution-shaped goals
  such as "rewrite this component" unless the user outcome requires it.

### 2. Bound The Change

- Record non-goals, platform and compatibility constraints, privacy and
  security invariants, affected surfaces, and dependencies.
- Define what must remain true across mobile, Electron, server, bridge, data,
  and release boundaries when those surfaces are involved.
- Choose the change shape from evidence: repair, refactor, split, merge, or
  replacement. Do not preserve a weak boundary merely because it exists.

### 3. Make Success Testable

- Define acceptance criteria as observable behavior, including important error,
  loading, empty, cancellation, accessibility, and compatibility states.
- Add a baseline and target for measurable outcomes such as latency, failure
  rate, startup time, memory, or support volume. Do not invent a metric when a
  qualitative criterion is sufficient.
- Name the evidence that will prove completion and the evidence that is not
  available in the current environment.

### 4. Slice And Hand Off

- Select the smallest coherent slice that can be reviewed and verified without
  hiding a required contract change. Sequence later slices explicitly.
- For risky changes, define rollout, observation, rollback, feature-flag owner,
  and removal condition before implementation. Do not add a flag by default.
- Route the resulting work to the minimum specialist set: architecture for a
  boundary decision, contract evolution for shared or persisted contracts,
  resilience for independent failures, security for trust boundaries, test
  strategy for verification, and UI quality for user-facing changes.

## Framing Output

Produce a concise frame with these headings:

1. Outcome and audience.
2. Problem and evidence.
3. Success criteria and proof.
4. Constraints, invariants, and non-goals.
5. Risks, assumptions, and unresolved questions.
6. Change shape and smallest coherent slice.
7. Rollout, rollback, and follow-up conditions.

If a missing decision blocks a safe plan, ask only for that decision. Do not
start implementation while silently guessing a product outcome.

## Streamer Adapter

- Use Graphify and the relevant source/tests to establish local facts, then read
  `ARCHITECTURE.md`, `PLAYBACK.md`, `UI.md`, or `AGENT_HANDOFF.md` as applicable.
- Keep shared API types and Zod schemas in `packages/shared`.
- Preserve playback persistence and telemetry restrictions: never move resolved
  media URLs, magnets, info hashes, raw streams, or bridge URLs into durable or
  broad contracts.
- Treat the current implementation as evidence. If it conflicts with a stronger
  product, safety, compatibility, or ownership requirement, name the gap and
  propose a staged migration.

Read `references/standards.md` when the framing involves a durable product or
architecture decision, measurable rollout, or a disputed tradeoff.
