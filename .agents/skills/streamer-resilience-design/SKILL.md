---
name: streamer-resilience-design
description: Use when designing, changing, or reviewing behavior across independently failing boundaries such as network calls, playback preparation, downloads, bridges, background jobs, queues, databases, native modules, or third-party services. Trigger for timeouts, retries, cancellation, idempotency, backpressure, degraded modes, recovery, or fault-injection tests; do not add resilience ceremony to local deterministic code.
---

# Streamer Resilience Design

Design failure behavior as part of the contract. A resilient system bounds work,
keeps one layer accountable for retries, makes degraded behavior visible, and
can recover without duplicating side effects.

## Workflow

### 1. Identify The Boundary

- Name the owner, caller, dependency, trust boundary, and user-visible outcome.
- Record synchronous and asynchronous interactions, state transitions, ordering,
  concurrency, and the data that must never cross the boundary.
- Establish a representative baseline before optimizing or adding retries.

### 2. Build The Failure Matrix

For each material failure, define:

- detection and deadline;
- owner of timeout and cancellation;
- retry eligibility, attempt limit, backoff, jitter, and retry budget;
- idempotency key or duplicate-handling rule;
- queue, concurrency, payload, and resource bounds;
- partial-success, fallback, and user-facing degraded state;
- cleanup, recovery signal, and rollback limit.

Retries must be owned by one layer. Do not multiply retries across callers and
dependencies. Do not retry non-idempotent work without an explicit duplicate
strategy.

### 3. Select The Smallest Control

- Prefer a timeout, cancellation path, bounded queue, or explicit fallback when
  that solves the observed failure. Add circuit breakers, bulkheads, or durable
  queues only when the failure mode and ownership justify their complexity.
- Make failure state observable without leaking credentials, user data, media
  URLs, magnets, info hashes, raw streams, or bridge URLs.
- Give temporary adapters, dual paths, and flags an owner and removal condition.

### 4. Verify The Failure Behavior

- Add focused tests for timeout, cancellation, retry exhaustion, duplicate
  completion, ordering, backpressure, partial success, fallback, and cleanup.
- Use deterministic clocks, fake dependencies, bounded fixtures, and controlled
  fault injection before considering broad chaos testing.
- Verify that telemetry is privacy-safe and that disabled instrumentation does
  not alter product behavior.
- Test recovery and rollback, not just the first failure.

## Design Output

Report:

1. Boundary and owner.
2. Failure matrix and user-visible states.
3. Timeout, retry, idempotency, concurrency, and cancellation policy.
4. Degraded mode, recovery, rollback, and observability.
5. Focused tests and residual risk.

## Streamer Adapter

- Read `ARCHITECTURE.md` and `PLAYBACK.md` for ownership and playback contracts.
- Keep playback sessions and events persistence-safe. Durable state must not
  contain resolved media URLs, magnets, info hashes, raw `Stream` objects, or
  bridge URLs.
- Preserve Electron sidecar ownership and the opt-in API bridge supervisor.
- Keep add-on source safety and production private-network restrictions intact.
- Route shared schema or event changes through `streamer-contract-evolution` and
  broad ownership changes through `streamer-architecture-guardrails`.

Read `references/standards.md` for cross-boundary design, a production incident,
or an unresolved reliability tradeoff.
