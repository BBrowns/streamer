---
name: streamer-reliability-change
description: Use when changing behavior across independently failing boundaries, including timeouts, retries, cancellation, idempotency, backpressure, restart recovery, degraded modes, or partial success. Do not use for local deterministic code.
---

# Streamer Reliability Change

Give every relevant failure a bounded outcome, recovery path, and observable signal.

## Workflow

1. Name the boundary owner, dependency, user-visible operation, steady state, and concrete failure modes.
2. Specify deadline ownership and cancellation propagation. A timeout without downstream cancellation is incomplete.
3. Define retry eligibility, limit, delay, budget, and idempotency. Ensure only one layer owns retries.
4. Bound queues and concurrency; state backpressure and duplicate, reordered, or delayed delivery behavior.
5. Define partial-success persistence, process restart, cleanup, degraded UX, and recovery after the dependency returns.
6. Add only the logs, metrics, traces, or breadcrumbs needed for an operator decision; keep dimensions bounded and preserve redaction contracts.
7. Test failures deterministically: timeout, cancellation at material phases, duplicate delivery, restart, dependency loss, recovery, and leaked-work prevention.

Read [references/reliability.md](references/reliability.md) for the failure contract. Read [references/telemetry.md](references/telemetry.md) only when production signals or SLOs change.

## Boundaries

Use `streamer-contract-change` when the wire or persisted shape changes. Use `streamer-security-boundaries` when URLs, private networks, IPC, credentials, or sensitive diagnostics are involved. Do not add retries, queues, feature flags, or telemetry without a demonstrated failure or bounded risk.

## Completion

Report failure states, timeout/retry/cancellation ownership, persistence and recovery behavior, degraded UX, fault tests, operational signals, and residual untested platform risk.
