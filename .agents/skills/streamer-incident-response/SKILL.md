---
name: streamer-incident-response
description: Use when investigating a production or release-candidate outage, crash, severe user report, Sentry issue, post-release regression, or measurable user-visible performance regression. Ordinary local failures use systematic debugging.
---

# Streamer Incident Response

Read the [portable core](../../skill-library/incident-response/SKILL.md) with this overlay as one workflow. Existing authorization carries through both; diagnosis-only requests remain read-only.

## Project Constraints

- Inspect local code, tests, and logs before Sentry. Use production telemetry read-only. Discover long-tail Sentry reads through `search_sentry_tools`; obtain approval before the `execute_sentry_tool` gateway call, and never use it for a write.
- Never copy tokens, personal data, resolved media URLs, magnets, info hashes, raw `Stream` objects, or bridge URLs into diagnostics, fixtures, source, reports, issues, memory, or logs.
- Read `ARCHITECTURE.md`, `PLAYBACK.md`, and `AGENT_HANDOFF.md` for ownership. Preserve Electron sidecar ownership, opt-in API bridge supervision, source-safety checks, production network defaults, and platform compatibility.
- Use repository runtime wrappers; never bypass `scripts/dev-runtime.cjs` for native bridge work. Use the isolated test database flow, never development or production databases for integration tests.
- Use Context Hub first for curated API references; otherwise use Context7 with the exact library version.
- For explicitly requested fixes, use `streamer-verification` for mapped checks and recovery evidence. Report missing device/simulator evidence. Apply the core's baseline/variance profiling guidance before performance changes.

## Project Routing

Use `streamer-security-boundaries` for suspected exploitation, `streamer-reliability-change` for changed failure/recovery semantics, and `streamer-delivery` only for an authorized hotfix rollout. Use `streamer-ui-change` for UI corrections. Report impact, cause, confidence, containment, recovery evidence, unknowns, and owned follow-ups.
