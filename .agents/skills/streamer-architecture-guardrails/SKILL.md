---
name: streamer-architecture-guardrails
description: Use when designing, refactoring, splitting, merging, replacing, or reviewing a module, component, package, service, API, schema, database change, event flow, background job, integration, dependency, or other change that alters ownership, state lifecycle, dependency direction, runtime, or system boundaries. Trigger for architecture proposals, component reshaping, data ownership, consequential migrations, reliability tradeoffs, and architecture debt; use contract evolution alone for routine compatible contract changes.
---

# Streamer Architecture Guardrails

Design changes from explicit quality attributes and durable engineering
principles. Treat the current implementation as evidence, not automatically as
the desired architecture.

Read `references/standards.md` for a consequential design, architecture review,
or unresolved quality tradeoff. Keep routine local decisions on this workflow.

## Standards Order

Apply guidance in this order:

1. The user's required outcome and stated constraints.
2. Safety, security, privacy, correctness, and compatibility obligations.
3. Explicit quality attributes such as reliability, evolvability, latency,
   operability, and cost.
4. Well-supported architecture principles and platform standards.
5. Stable product contracts and repository ownership rules.
6. Existing implementation patterns.

Do not preserve a weak local pattern merely for consistency. Name the gap,
choose the better target, and use a compatible migration when an immediate
replacement would create unacceptable risk or scope.

## Workflow

### 1. Establish The Decision Context

- Query Graphify for the affected concepts, owners, callers, and dependencies.
- Read the source and tests identified by the graph.
- Read the repository architecture and subsystem contracts that govern the
  change.
- State the user outcome, non-goals, constraints, and affected quality
  attributes.
- Distinguish facts, assumptions, and decisions. Verify consequential
  assumptions before implementation.

### 2. Model The Boundary

Describe the proposed design with:

- responsibility and owner;
- public contract and invariants;
- allowed dependency direction;
- state owner, lifecycle, and retention;
- trust and runtime boundaries;
- synchronous and asynchronous interactions;
- failure, timeout, retry, cancellation, and partial-success behavior;
- concurrency, ordering, and idempotency expectations;
- observability without sensitive-data leakage.

Prefer a cohesive existing boundary when it can own the behavior cleanly.
Create a new abstraction only when it removes meaningful coupling, isolates a
volatile concern, or establishes a contract that has more than one real
consumer.

### 3. Compare Options

For a consequential design, compare at least the status quo and the proposed
option. Add a third option when it represents a materially different tradeoff.

Evaluate:

- correctness and security;
- failure isolation and recovery;
- coupling and change amplification;
- operational complexity;
- migration and rollback;
- testability and observability;
- performance and cost based on evidence;
- reversibility and future options.

Do not justify a design with hypothetical scale alone. Do not centralize or
distribute a responsibility without naming the failure and ownership
consequences.

### 4. Plan Evolution

First choose the appropriate change shape:

- repair when the responsibility and boundary are sound and the defect is local;
- refactor when the contract remains useful but the implementation impedes
  change or testing;
- split or merge when cohesion, ownership, or lifecycle is wrong;
- replace when core assumptions, trust boundaries, platform fit, or failure
  behavior are structurally unsuitable.

Use evidence such as repeated change amplification, duplicated policy, unstable
adapters, recurring incidents, or measured bottlenecks. Do not preserve a weak
component because replacement is larger than a local patch, and do not choose a
rewrite from aesthetic preference alone.

- Keep changes small and reversible when feasible.
- Establish characterization tests for behavior that must survive a refactor or
  replacement.
- Define compatibility across old and new producers, consumers, and persisted
  data.
- Use expand-and-contract for breaking contracts or schema transitions.
- Define backfill, dual-read, dual-write, or versioning behavior only when the
  migration needs it.
- State rollback limits, especially after irreversible data changes.
- Give temporary adapters, flags, and parallel paths an owner and removal
  condition; avoid a permanent dual architecture.
- Add architecture fitness checks where a boundary can regress mechanically.

Record a decision when it changes a durable boundary, public contract, data
owner, security posture, deployment topology, or expensive technology choice.
Capture context, options, decision, consequences, migration, and revisit
conditions. Do not create an ADR for a routine local implementation choice.

### ADR Lifecycle

- Use `docs/adr/TEMPLATE.md` for new durable decisions. Keep records additive;
  do not rewrite history to make an old decision look current.
- Mark records `Proposed`, `Accepted`, `Superseded`, or `Deprecated`. Link the
  replacement when a decision changes and preserve the original rationale.
- Include an owner, date, affected boundary, migration and rollback limits, and
  concrete revisit triggers. A revisit trigger is not a promise to revisit on a
  calendar without evidence.
- Keep an ADR focused on the decision and consequences. Put implementation
  checklists and temporary task state in the PR or task, not in the ADR.

### 5. Validate The Design In Code

- Keep cross-client contracts in their canonical shared owner.
- Validate inputs and outputs at trust or process boundaries.
- Test contracts, failure modes, and migrations, not only the happy path.
- Run focused tests and typechecks for every changed owner and consumer.
- Inspect dependency changes and generated artifacts before completion.
- Update architecture or operational documentation when the durable contract
  changes.

## Streamer Adapter

- Read `ARCHITECTURE.md` first for service and package ownership.
- Read `PLAYBACK.md` for session, stream, and bridge contracts.
- Read `docs/ELECTRON_SECURITY.md` for desktop process and IPC boundaries.
- Keep shared API types and Zod schemas in `packages/shared`.
- Preserve platform ownership: Electron owns its desktop bridge sidecar; the API
  bridge supervisor remains opt-in.
- Never move resolved media URLs, magnets, info hashes, raw stream objects, or
  bridge URLs into persistence, logs, telemetry, or broad shared contracts.
- Preserve add-on source-safety checks and production private-network defaults.

After code changes, refresh Graphify and run the narrowest owner and consumer
checks first. Use `npm run verify:quick` for cross-workspace changes and
`npm run verify:full` when release-level confidence is required.

## Completion Evidence

Report:

- the boundary and quality attributes affected;
- the option chosen and material tradeoffs;
- migration and rollback behavior;
- contracts, tests, and documentation changed;
- known residual risk or deferred architecture debt.
