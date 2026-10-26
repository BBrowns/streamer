---
name: contract-change
description: Use when changing a shared, serialized, persisted, API, IPC, event, or schema contract with independently evolving consumers or compatibility obligations. Do not use for a private one-owner implementation type.
---

# Contract Change

Evolve durable contracts while preserving the compatibility window the product
and deployment model actually require.

## Project integration

Read the target project's instructions, contract definitions and affected tests.
Use its canonical schema owner, generators and verification commands. When a
project overlay invokes this core, apply both as one workflow. Reuse the current
plan and evidence; this skill does not add a separate planning or review cycle.

## Workflow

1. Identify producers, independently evolving consumers, validators, stored
   records, generated surfaces and relevant fixtures. Establish ownership and
   deployment order before choosing a transition.
2. Classify the change as internal, additive-compatible, behaviorally breaking,
   structurally breaking or retiring. Check field meaning, defaults, errors and
   ordering as well as shape.
3. Define coexistence of old/new producers, consumers and stored data for the
   required window. Prefer additive fields with compatible defaults and
   expand-and-contract where deployments overlap. Keep one canonical internal
   model and isolate legacy translation at boundaries.
4. Add backfill, dual reads/writes, versioning or adapters only when the migration
   needs them. State rollback limits, including any point requiring forward
   repair. Give temporary paths an owner and measurable removal condition.
5. Test serialization, parsing, absent/invalid values, old/new compatibility,
   persistence and affected consumers at the lowest stable boundary. Use the
   project's checks; a consumer contract test does not replace storage or
   transport integration evidence.

For consequential or breaking changes, read
[contract evolution](references/contracts.md).

## Adjacent concerns

Review delivery, retry, ordering and restart semantics when they change; review
trust and sensitive-data handling when the contract crosses such a boundary.
Use an available specialist only for those changed concerns. Missing optional
skills do not prevent assessing the boundary directly.

## Completion

Report the applicable producer/consumer compatibility matrix, migration and
rollback behavior, checks actually run, documentation changed and retirement
conditions. Keep missing evidence explicit.
