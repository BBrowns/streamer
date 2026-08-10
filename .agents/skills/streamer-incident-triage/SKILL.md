---
name: streamer-incident-triage
description: Use when investigating a production or release-candidate incident, outage, crash, Sentry issue, severe user report, post-release regression, data integrity concern, security event, or recurring operational failure. Trigger for impact assessment, containment planning, evidence timelines, release correlation, safe production diagnostics, regression creation, corrective action, and post-incident learning.
---

# Streamer Incident Triage

Turn production evidence into containment, a reproducible cause, a verified
correction, and durable learning. Keep urgent mitigation distinct from the
long-term design decision.

Read `references/standards.md` for broad impact, data or security risk, repeated
incidents, unclear ownership, or a post-incident review. A narrow release
regression can stay on this workflow.

## Relationship To Other Skills

- Use systematic-debugging for root-cause investigation rather than speculative
  fixes.
- Use `streamer-test-strategy` to turn the failure into stable regression
  coverage.
- Use `streamer-security-review` for suspected abuse, exposure, privilege, or
  sensitive-data impact.
- Use `streamer-architecture-guardrails` when the durable correction changes a
  boundary or component responsibility.
- Use `streamer-delivery-readiness` for hotfix scope, release evidence, and
  publication.

Do not trigger this skill for an ordinary local test or development failure
with no production, release-candidate, or recurring operational signal.

## Workflow

### 1. Establish Impact And Ownership

Record known facts:

- affected user journey, platform, environment, and release;
- first and last observed time and whether impact is ongoing;
- frequency, population, severity, and data or security implications;
- current incident owner and decision channel when one exists;
- confidence and unknowns.

Do not infer broad impact from one event. Do not minimize a silent integrity,
privacy, authentication, or persistence failure because event volume is low.

### 2. Plan Containment

Choose the smallest reversible action that reduces user harm without destroying
evidence. Consider rollback, feature disablement, traffic isolation, degraded
mode, or operational guidance.

Production changes, feature flags, release actions, messages, and issue updates
require explicit user authority. Without it, provide the exact containment
recommendation and continue safe read-only diagnosis.

### 3. Build The Evidence Timeline

- Identify the exact artifact, commit, configuration, dependency set, and
  migration state.
- Start with local code, tests, release evidence, and logs available in scope.
- Use Sentry only as read-only production evidence and query the smallest useful
  window and fields.
- Correlate by release, platform, operation, and safe identifiers rather than
  copying raw event payloads.
- Separate symptom, trigger, propagation, detection, and mitigation events.

Never place credentials, personal data, resolved media URLs, magnets, info
hashes, raw streams, or bridge URLs in source, issues, memory, fixtures, or the
incident report.

### 4. Reproduce And Diagnose

- Create the smallest controlled reproduction at the nearest stable boundary.
- Compare affected and unaffected releases, platforms, inputs, or states.
- Trace causality from symptom to the owning defect; distinguish root cause from
  contributing conditions and detection gaps.
- Confirm the hypothesis with an experiment that could disprove it.
- Add a failing regression test before the permanent correction when feasible.

Do not treat temporal correlation, a noisy stack frame, or the latest changed
file as proof of cause.

### 5. Correct At The Right Depth

Use a narrow hotfix when it safely stops active harm. Plan a separate durable
change when urgency prevents a complete correction.

Refactor or replace a component when repeated incidents show that its ownership,
state model, trust boundary, or failure handling is structurally wrong. Preserve
the user contract through a staged migration, and track removal of the temporary
mitigation. An incident should not force permanent retention of the design that
caused it.

### 6. Verify And Watch

- Run the regression, affected package, integration, security, and release gates
  required by the failure path.
- Verify rollback and compatibility when the correction changes persisted data
  or shared contracts.
- Define the production signal, observation window, and success threshold that
  would confirm recovery.
- Derive the observation window from traffic, adoption, prior failure frequency,
  and impact; do not apply a generic duration to every incident.
- State what cannot be validated without a real device, production release, or
  external authorization.

### 7. Learn Without Adding Ceremony

Create a post-incident record when impact was material, detection or recovery
was weak, the incident repeated, or the correction changes a durable boundary.
Capture timeline, impact, root cause, contributing conditions, response quality,
and prioritized actions with owners.

Prefer one systemic prevention or detection improvement over many vague action
items. Store only reviewed, durable conventions or pitfalls in agent memory.

## Completion Evidence

Report:

- impact, affected release, confidence, and current state;
- containment taken or recommended and its authorization status;
- evidence timeline, reproduction, and confirmed cause;
- regression coverage and corrective change depth;
- recovery signal, observation gap, and follow-up owners.
