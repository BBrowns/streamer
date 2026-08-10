---
name: streamer-maintenance-radar
description: "Use for scheduled or explicit read-only health reviews of the Streamer repository: dependency drift, security posture, CI failures, GitHub Actions policy, stale exceptions, temporary flags or adapters, documentation gaps, and agent-process drift. Produce a prioritized maintenance report without editing files, opening issues, changing settings, or creating PRs."
---

# Streamer Maintenance Radar

Find actionable maintenance work before it becomes an incident or blocks a
release. Prefer compact evidence and a small queue over a complete inventory.

## Operating Rules

- Read-only by default. Do not edit source, lockfiles, docs, memory, graph
  artifacts, GitHub settings, issues, or pull requests.
- Use `scripts/collect.mjs` first. It emits bounded, privacy-safe evidence and
  records unavailable sources instead of failing the whole review.
- Use `gh` only for read operations. Do not print tokens, telemetry payloads,
  secret values, URLs containing credentials, or detailed security findings.
- Use package-manager inspection commands that do not rewrite manifests or
  lockfiles. Never run automatic upgrades or `npm audit fix`.
- Treat the first run as a baseline. Later reports emphasize changes in the
  selected lookback window and repeat only unresolved high-impact items.

## Workflow

### 1. Collect Evidence

Run:

```bash
npm run maintenance:collect -- --since-days 7 --json
```

Then inspect only the source-specific evidence needed to explain a finding.

### 2. Classify Findings

Classify each item:

- **Now:** user harm, active release risk, high/critical security exposure,
  broken required control, or an expiring exception.
- **Next:** meaningful reliability, compatibility, dependency, CI, or process
  debt that should receive a bounded task.
- **Watch:** low-impact drift, stale documentation, or a future migration with
  no immediate action.

For every `Now` or `Next` item include evidence, impact, owner or proposed
owner, smallest follow-up, and the condition that closes it. Deduplicate CodeQL,
dependency, Sentry, and local test signals before prioritizing.

### 3. Report And Stop

Return:

1. Lookback and repository revision.
2. Three-line health summary.
3. `Now`, `Next`, and `Watch` findings in priority order.
4. Checks unavailable and why.
5. Recommended next task, if one is justified.

Do not convert the report into a PR or issue automatically. A human decides
whether a finding becomes implementation work, a security response, or a
scheduled migration.

## Streamer Adapter

- Read `docs/DEPENDENCY_SECURITY.md`, `AGENT_HANDOFF.md`, and relevant runbooks
  when a finding needs interpretation.
- Treat Sentry as read-only production evidence and report only aggregate
  counts or safe links; never copy sensitive telemetry into output.
- Check temporary feature flags, adapters, audit exceptions, and compatibility
  paths for an owner and removal condition.
- Keep `graphify-out/` and `.agent-memory/` out of findings unless their local
  health is explicitly requested.

Read `references/standards.md` for report thresholds and maintenance priority.
