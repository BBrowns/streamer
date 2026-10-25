---
name: streamer-contract-change
description: Use when changing a shared, serialized, persisted, API, IPC, bridge, event, or schema contract with multiple consumers or compatibility obligations. Do not use for local one-owner TypeScript types.
---

# Streamer Contract Change

Read the [portable contract-change core](../../skill-library/contract-change/SKILL.md)
and apply these Streamer constraints in the same workflow. Reuse the current
task plan and project verification evidence.

## Project constraints

- Read `ARCHITECTURE.md` and `PLAYBACK.md` for affected ownership, session,
  stream and persistence contracts.
- Keep shared API types and Zod schemas in `packages/shared`. Do not duplicate
  cross-client contracts in the API, mobile app or desktop bridge.
- Never persist or log resolved media URLs, magnets, info hashes, raw `Stream`
  objects or bridge URLs, including in migration fixtures and diagnostics.
- Use the affected workspace tests and shared schema/typechecks selected by
  `streamer-verification`. Browser or preflight evidence does not establish
  real-device playback or bridge behavior.

## Boundaries

- Use `streamer-reliability-change` only when delivery, retries, ordering, cancellation, or restart semantics change.
- Use `streamer-security-boundaries` only when the payload crosses a trust boundary or contains sensitive material.

## Completion

Use the core's compatibility and migration report, with the exact Streamer
workspace/schema checks run and any skipped device evidence.
