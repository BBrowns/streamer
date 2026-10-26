---
name: reliability-change
description: Use when changing timeouts, retries, cancellation, idempotency, backpressure, restart recovery, degraded modes, or partial success across independently failing boundaries. Do not use for local deterministic code.
---

# Reliability Change

Give relevant failures bounded outcomes, explicit ownership and a recovery path.

## Project integration

Read the target project's instructions, boundary contracts and affected tests.
Use its privacy rules, operational signals and verification commands. When a
project overlay invokes this core, apply both as one workflow. Reuse the current
plan and evidence rather than adding separate planning or review cycles.

## Workflow

1. Name the operation, boundary owner, dependency, steady state and concrete
   failure modes. Add controls for demonstrated failures or bounded risks.
2. Assign deadline ownership and propagate cancellation to work that supports
   it. When external work cannot be cancelled, bound local waiting and define
   reconciliation, cleanup or compensation; do not claim remote work stopped.
3. Define retry eligibility, attempt limit, delay, total budget and idempotency.
   One layer owns retries. Ambiguous outcomes of non-idempotent side effects
   require deduplication or reconciliation before another attempt is safe.
4. Bound queues and concurrency. Specify backpressure and duplicate, reordered
   or delayed delivery behavior where relevant.
5. Define partial-success persistence, process restart, cleanup, degraded user
   experience and recovery when the dependency returns. Give temporary recovery
   paths an owner and retirement condition.
6. Select only signals that answer an operator question. Keep metric dimensions
   bounded and redact sensitive data according to the project contract.
7. Test applicable failures deterministically: timeout, cancellation at material
   phases, duplicate delivery, restart, dependency loss/recovery and leaked work.
   Use the project's stable test boundary and commands; report limits of mocked
   or local evidence.

Read [the failure contract](references/reliability.md) for consequential changes.
Read [telemetry guidance](references/telemetry.md) only when production signals
or service objectives change.

## Adjacent concerns

Assess compatibility when wire or stored shapes change, and security when trust,
credentials, destinations or sensitive diagnostics change. Use available
specialists only for those concerns; assess directly if no specialist exists.

## Completion

Report failure states, deadline/retry/cancellation owners, persistence and
recovery, degraded behavior, fault tests, operational signals and untested
platform or external-service limits.
