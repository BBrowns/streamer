---
name: streamer-observability-design
description: Use when adding, changing, or reviewing production logs, metrics, traces, Sentry events or breadcrumbs, diagnostic events, dashboards, alerts, SLIs, SLOs, sampling, or telemetry retention. Trigger when a feature or incident needs new operational evidence; ordinary debugging that consumes existing evidence uses incident triage or performance profiling instead.
---

# Streamer Observability Design

Design the smallest privacy-safe signal set that answers a concrete product or
operational question. Telemetry is a production contract with cost, ownership,
and data-handling consequences.

Read `references/standards.md` for a broad telemetry design, SLO or alerting
change, or unresolved signal-model decision.

## Workflow

### 1. Start With The Decision

State:

- the user journey or system boundary being observed;
- the question an operator or product owner must answer;
- the decision or action the signal enables;
- the failure, latency, quality, or saturation outcome that matters;
- the accountable owner and expected response.

Prefer existing safe signals when they answer the question. Do not add telemetry
only because a value is available.

### 2. Define The Signal Contract

For every event, metric, log, breadcrumb, or span define:

- stable name and operation boundary;
- type, unit, success and error semantics;
- bounded attributes and allowed values;
- source of truth and aggregation point;
- sampling, retention, and expected volume;
- release, environment, and platform correlation;
- dashboard, alert, SLO, or investigation that consumes it.

Use low-cardinality dimensions. Never use user IDs, URLs, error messages, media
identifiers, request IDs, or other unbounded values as metric labels. Keep rich
diagnostic context in privacy-safe traces or logs when it is actually needed.

### 3. Protect Data And Cost

- Collect the minimum data needed for the stated decision.
- Redact before data crosses a process or vendor boundary.
- Never emit resolved media URLs, magnets, info hashes, raw `Stream` objects,
  bridge URLs, credentials, tokens, personal data, or full request payloads.
- Reuse shared redaction and breadcrumb helpers rather than creating a second
  sanitization path.
- Bound event size, attribute count, retry volume, and diagnostic buffering.
- Make sampling intentional; preserve critical errors while controlling noisy
  success and performance signals.

Use `streamer-security-review` when telemetry crosses a new trust boundary,
contains user-controlled input, or changes retention or third-party exposure.

### 4. Design SLOs And Alerts

Choose a small set of user-outcome SLIs. Define the population, good events,
measurement window, exclusions, target, data-quality caveats, and owner.

Alert only when a human can take a documented action. Prefer sustained burn or
impact over isolated failures. Include runbook or triage entrypoint, severity,
deduplication, and recovery signal. Dashboards may explain; pages must demand
action.

### Rollout Evidence

When a change is staged or guarded, define the signal that permits expansion,
the threshold that aborts or rolls back, the observation window, and the owner
who makes the decision. Compare the result with the pre-change baseline and
record whether the signal is conclusive, unavailable, or distorted by sampling.

Do not create a new metric solely to make a rollout look measurable. Reuse a
safe existing signal when it answers the decision, and remove rollout-only
telemetry when its owner and retention decision say it is no longer needed.

### 5. Verify End To End

- Test names, units, status mapping, and bounded attribute sets.
- Add negative tests for redaction and prohibited values.
- Exercise success, expected failure, timeout, cancellation, and fallback paths.
- Confirm disabled or sampled telemetry does not alter product behavior.
- Inspect emitted evidence in a test or preview environment when feasible.
- Verify dashboards and alerts against known synthetic conditions before relying
  on them operationally.

## Streamer Adapter

- Keep build metadata as the source for release and environment correlation.
- Treat `PlaybackDiagnostics` as runtime evidence, not automatically as a
  vendor-export contract.
- Preserve shared Sentry sanitization in `packages/shared` and platform-specific
  before-send boundaries.
- Separate playback preparation, first-frame, buffering, fallback, seeking, and
  terminal failure; one generic playback timer cannot explain these states.
- Measure bridge and add-on outcomes without exposing destinations or source
  material.
- Sentry reads remain evidence. Do not copy sensitive telemetry into source,
  issues, memory, or agent output.

## Completion Evidence

Report:

- operational question and owner;
- signal names, boundaries, units, and allowed dimensions;
- privacy, volume, sampling, and retention decisions;
- SLI/SLO or alert semantics when applicable;
- tests and preview evidence;
- remaining blind spots and rollout or rollback conditions.
