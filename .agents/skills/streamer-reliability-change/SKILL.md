---
name: streamer-reliability-change
description: Use when changing behavior across independently failing boundaries, including timeouts, retries, cancellation, idempotency, backpressure, restart recovery, degraded modes, or partial success. Do not use for local deterministic code.
---

# Streamer Reliability Change

Read the [portable reliability-change core](../../skill-library/reliability-change/SKILL.md)
and apply these Streamer constraints in the same workflow. Reuse the current
task plan and project verification evidence.

## Project constraints

- Read `ARCHITECTURE.md` and `PLAYBACK.md` for the affected state owner,
  session, stream and restart contracts.
- Preserve platform ownership: Electron owns its desktop bridge sidecar; the
  API bridge supervisor is opt-in. Keep recovery and cancellation at the owning
  service boundary.
- Never persist or log resolved media URLs, magnets, info hashes, raw `Stream`
  objects or bridge URLs. Operational dimensions must remain bounded.
- Use `scripts/dev-runtime.cjs` for native bridge execution and the focused
  bridge/runtime checks selected by `streamer-verification`. Keep untested
  real-device playback, casting and download behavior explicit.

## Boundaries

Use `streamer-contract-change` when the wire or persisted shape changes. Use `streamer-security-boundaries` when URLs, private networks, IPC, credentials, or sensitive diagnostics are involved. Do not add retries, queues, feature flags, or telemetry without a demonstrated failure or bounded risk.

## Completion

Use the core's failure/recovery report, with Streamer owner boundaries, exact
workspace/bridge checks run and any untested device evidence.
