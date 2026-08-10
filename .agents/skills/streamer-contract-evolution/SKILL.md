---
name: streamer-contract-evolution
description: Use when changing shared types, Zod or JSON schemas, API payloads, IPC, bridge or event protocols, persisted records, Prisma schemas, serialized state, or producer-consumer behavior. Trigger for compatibility, versioning, schema evolution, data migration, deprecation, contract tests, and replacement of a contract or component without breaking active clients or stored data.
---

# Streamer Contract Evolution

Evolve contracts deliberately without freezing a weak design in place. Preserve
only behavior that active consumers or persisted data rely on, and give every
temporary compatibility path an exit condition.

Read `references/standards.md` for a breaking, persisted, cross-runtime, or
multi-release transition. Keep a purely additive local change on this workflow.

## Relationship To Other Skills

- Use `streamer-architecture-guardrails` when ownership or the component
  boundary itself should change.
- Use `streamer-test-strategy` to select contract, integration, and migration
  test layers.
- Use `streamer-security-review` when the contract crosses a trust boundary or
  carries sensitive or privileged data.
- Do not trigger this skill for an internal TypeScript type with one owner and
  no serialized, persisted, or independently deployed consumer.

## Workflow

### 1. Map The Contract

Identify:

- canonical owner and source file;
- producers, consumers, and deployment independence;
- wire format, parser, serializer, defaults, and semantic invariants;
- persisted forms, schema versions, migrations, fixtures, and old clients;
- the oldest data or consumer that must remain supported;
- forbidden fields and data-retention constraints.

Use Graphify to find likely relationships, then verify every consequential
producer and consumer in source and tests.

Stop discovery once the canonical owner, independently deployed consumers,
persisted forms, compatibility window, and affected trust boundaries are known.
Do not exhaustively trace internal callers that cannot change the compatibility
decision. For a planning request, return unresolved decision inputs instead of
performing an implementation-depth repository audit.

### 2. Classify The Change

Evaluate source, wire, validation, semantic, and storage compatibility. Treat
renames, removals, type or default changes, narrower validation, changed enum
handling, and changed failure semantics as potentially breaking.

Choose the lightest valid transition:

1. In-place additive change when old consumers preserve their behavior.
2. Coordinated change only when all consumers deploy atomically and no old
   serialized data survives.
3. Expand-and-contract when versions overlap or persisted data must migrate.
4. Clean replacement when the surface is truly internal and no compatibility
   obligation exists.

Do not add versioning or adapters speculatively. Do not call a compile-clean
change compatible until runtime and semantic behavior have been checked.

### 3. Design The Transition

- Define old/new producer-consumer combinations that must work.
- Expand readers before writers depend on the new form.
- Translate legacy input at the owning boundary into one current internal
  model; avoid spreading version checks through business logic.
- Use backfill, dual-read, or dual-write only when the deployment sequence
  requires it. Make reconciliation and idempotency explicit.
- State rollback behavior before any irreversible migration.
- Assign removal evidence, owner, and deadline to every deprecated path.

A replacement is valid when the old component has the wrong responsibility,
lifecycle, trust boundary, or contract shape. Preserve the external invariant
through an adapter or versioned transition, then remove the obsolete component
instead of maintaining two permanent architectures.

### 4. Implement And Verify

- Change the canonical shared schema or type before updating consumers.
- Validate untrusted and cross-process data at the boundary.
- Add fixtures for the oldest supported form and the new form.
- Test parsing, serialization, defaults, unknown values, malformed input, and
  round trips where relevant.
- Test each required old/new compatibility combination at the lowest stable
  boundary, plus one real integration path when framework behavior matters.
- Rehearse migrations on the isolated test database or representative
  disposable data. Never use a development or production database for tests.
- Verify that logs, telemetry, snapshots, and persistence do not gain forbidden
  media or bridge data.

### 5. Contract The Old Surface

Remove old fields, adapters, flags, dual writes, and migration-only telemetry
only after evidence shows the supported consumers and data have moved. Update
the shared contract documentation and architecture decision when the durable
boundary changed.

## Streamer Adapter

- Keep cross-client API types and Zod schemas in `packages/shared`.
- Read `PLAYBACK.md` for playback session, event, stream, and bridge contracts.
- Keep resolved media URLs, magnets, info hashes, raw `Stream` objects, and
  bridge URLs out of persisted and broadly shared contracts.
- Treat mobile, server, stream-server, and Electron bridge versions as
  independently observable unless the actual deployment proves atomicity.
- Run shared schema tests, every changed owner and consumer test, and affected
  workspace typechecks. Use `npm run verify:quick` for cross-workspace changes.

## Completion Evidence

Report:

- contract owner, producers, consumers, and compatibility window;
- change classification and selected transition;
- migration, rollback, and retirement conditions;
- old/new combinations and failure modes tested;
- residual unsupported versions or data risk.
