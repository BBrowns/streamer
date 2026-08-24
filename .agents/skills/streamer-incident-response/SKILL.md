---
name: streamer-incident-response
description: Use when investigating a production or release-candidate outage, crash, severe user report, Sentry issue, post-release regression, or measurable user-visible performance regression. Ordinary local failures use systematic debugging.
---

# Streamer Incident Response

Reduce user harm, preserve privacy-safe evidence, establish root cause, and verify recovery.

## Workflow

1. State severity, affected users/platforms/versions, start time, current impact, evidence sources, confidence, and unknowns.
2. Choose the smallest reversible containment. Do not mutate production, disable controls, roll out, or message users without authorization.
3. Build one fact-based timeline from local code/tests/logs first. Use Sentry or other production evidence read-only and never copy tokens, personal data, resolved media URLs, magnets, info hashes, or bridge URLs.
4. Reproduce at the nearest stable boundary and trace the first causal divergence. Separate trigger, root cause, detection gap, and contributing conditions.
5. For latency or resource regressions, define the user-visible metric, representative scenario, baseline, variance, and profile before optimizing. Read [references/performance.md](references/performance.md).
6. If the user explicitly requested a fix, implement the smallest correction at the owning boundary, add regression coverage, verify containment removal, and define the recovery signal. For diagnosis-only work, stop with evidence, root cause or ranked hypotheses, containment options, and the next decision; do not edit source or external state.
7. Record follow-ups only when they have an owner and close condition.

Read [references/incidents.md](references/incidents.md) for consequential response and post-incident learning.

## Routing

Use `streamer-security-boundaries` for suspected exploitation, `streamer-reliability-change` for changed failure/recovery semantics, and `streamer-delivery` only for an authorized hotfix rollout.

## Completion

Report impact and timeline, containment, root cause and confidence, any authorized changed boundary and regression/recovery evidence, remaining unknowns, and owned follow-ups.
