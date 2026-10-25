---
name: incident-response
description: Use when investigating a production or release-candidate outage, crash, severe user report, monitoring issue, post-release regression, or measurable user-visible performance regression. Ordinary local failures use standard debugging.
---

# Incident Response

Reduce user harm, preserve privacy-safe evidence, establish root cause, and verify recovery. Use the target project's tooling, observability access, and operational policies.

When a project overlay accompanies this core, read both as one workflow. Apply its specific constraints and existing user authorization without adding a second approval step for the same action.

## Workflow

1. State severity, affected users/platforms/versions, start time, current impact, evidence sources, confidence, and unknowns.
2. Choose the smallest reversible containment. Production mutation, disabling controls, rollout, or user communication requires authorization for that action. A diagnosis request alone does not authorize changes.
3. Build one fact-based timeline from local code/tests/logs first, then use permitted production evidence read-only. Protect credentials, personal data, private payloads, and project-defined sensitive values in queries, reports, fixtures, and logs.
4. Reproduce at the nearest stable boundary and trace the first causal divergence. Separate trigger, root cause, detection gap, and contributing conditions.
5. For latency or resource regressions, define the user-visible metric, representative scenario, baseline, variance, and profile before optimizing. Read [references/performance.md](references/performance.md).
6. When a fix is authorized, implement the smallest correction at the owning boundary, add regression coverage, verify containment removal, and define the recovery signal. For diagnosis-only work, stop with evidence, root cause or ranked hypotheses, containment options, and the next decision; do not edit source or external state.
7. Record follow-ups only when they have an owner and close condition.

Read [references/incidents.md](references/incidents.md) for consequential response and post-incident learning.

Use installed, applicable specialists for suspected exploitation, changed failure/recovery semantics, or an authorized rollout. Otherwise perform the relevant analysis directly; additional skills are optional and do not expand authorization.

## Completion

Report impact and timeline, containment, root cause and confidence, any authorized changed boundary and regression/recovery evidence, remaining unknowns, and owned follow-ups.
