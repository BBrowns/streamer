---
name: streamer-contract-change
description: Use when changing a shared, serialized, persisted, API, IPC, bridge, event, or schema contract with multiple consumers or compatibility obligations. Do not use for local one-owner TypeScript types.
---

# Streamer Contract Change

Evolve durable contracts without breaking current consumers, persisted data, or rollout safety.

## Workflow

1. Identify every producer, consumer, validator, persisted form, generated surface, fixture, and document. Read [references/contracts.md](references/contracts.md) for consequential or breaking changes.
2. Classify the change as internal, additive-compatible, behaviorally breaking, structurally breaking, or retiring.
3. Define how old and new producers, consumers, and stored records coexist. Prefer additive optional fields and expand-and-contract over coordinated breaking rollout.
4. Keep shared API types and Zod schemas in `packages/shared`. Do not duplicate cross-client contracts.
5. Define backfill, dual-read/write, versioning, rollback, and retirement only where the migration actually needs them.
6. Test serialization, parsing, old/new compatibility, malformed inputs, persistence, and affected consumers at the lowest stable boundary.
7. Give every adapter or dual path an owner and measurable removal condition.

## Boundaries

- Use `streamer-reliability-change` only when delivery, retries, ordering, cancellation, or restart semantics change.
- Use `streamer-security-boundaries` only when the payload crosses a trust boundary or contains sensitive material.
- Never persist or log resolved media URLs, magnets, info hashes, raw `Stream` objects, or bridge URLs.

## Completion

Provide a producer/consumer compatibility matrix, migration and rollback behavior, exact tests and typechecks run, documentation changed, and the retirement condition for temporary compatibility paths.
