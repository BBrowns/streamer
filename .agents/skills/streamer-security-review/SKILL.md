---
name: streamer-security-review
description: Use when a change touches authentication, authorization, untrusted input, URLs, networking, sensitive persistence, uploads, files, processes, IPC, native bridges, secrets, logging, telemetry, add-ons, privileged or security-sensitive dependencies, permissions, streaming data, or security-relevant release configuration. Trigger for threat modeling, abuse cases, security or privacy review, advisory exploitability, install-script or provenance risk, and hardening; routine compatible package updates use dependency upgrades alone.
---

# Streamer Security Review

Review security from assets and trust boundaries outward. Treat secure defaults,
least privilege, and data minimization as design requirements, not cleanup.

Read `references/standards.md` for a broad or high-risk review, a formal finding,
or an unresolved control decision. Keep a narrow review on this workflow.

## Standards Order

Use:

1. Explicit legal, privacy, safety, and user requirements.
2. Current platform security guidance and recognized verification standards.
3. Repository security and data-handling contracts.
4. Existing implementation patterns.

Flag a local pattern that falls below the baseline. Preserve compatibility only
as part of an explicit migration; do not normalize insecure behavior.

## Workflow

### 1. Model The System

Identify:

- assets and sensitive data;
- actors, roles, and privileges;
- entry points and untrusted inputs;
- process, network, account, and storage trust boundaries;
- data flows, retention, and deletion;
- privileged operations and irreversible side effects;
- third-party services, packages, and update channels.

Answer:

1. What are we working on?
2. What can go wrong?
3. What controls reduce that risk?
4. How will the controls be verified?

### 2. Enumerate Abuse Cases

Consider relevant cases:

- authentication bypass and authorization confusion;
- injection in queries, commands, templates, logs, or IPC;
- SSRF, DNS rebinding, redirects, private-network access, and unsafe URL schemes;
- path traversal, symlink attacks, unsafe archives, and file overwrite;
- cross-site scripting, unsafe navigation, and privileged renderer escape;
- secret or sensitive-data exposure through source, errors, logs, telemetry,
  caches, snapshots, or persistence;
- replay, duplicate requests, race conditions, and confused-deputy behavior;
- unbounded work, resource exhaustion, decompression bombs, and large payloads;
- vulnerable or malicious dependencies and install scripts;
- insecure defaults, debug modes, or environment fallbacks.

Use structured parsers, canonicalization, allowlists, parameterized APIs, and
bounded resources. Do not rely on string-prefix checks for security decisions.

### 3. Design Controls

- Deny by default and grant the smallest capability for the shortest duration.
- Authenticate identity and authorize every privileged action at the boundary
  that owns the resource.
- Validate type, shape, size, encoding, scheme, host, path, and destination
  where relevant.
- Keep secrets out of client bundles and source. Use approved secret storage and
  rotate exposed credentials.
- Minimize sensitive data collection, propagation, retention, and logging.
- Return safe errors while preserving internal diagnostic context.
- Use established cryptographic and authentication libraries; do not invent
  protocols.
- Pin and review privileged dependencies. Inspect lifecycle scripts and
  transitive risk.
- Define containment, auditability, and recovery for a failed control.

### 4. Verify

- Add negative tests for each material abuse case and boundary.
- Test authorization with the wrong actor, tenant, origin, and object.
- Test malformed, oversized, encoded, redirected, duplicate, and concurrent
  input where relevant.
- Run dependency and install-script checks for dependency changes.
- Inspect logs, telemetry, snapshots, and fixtures for sensitive values.
- Exercise Electron or native security behavior in the actual runtime when
  affected.

Order review findings by severity. Include the attack path, impact, evidence,
recommended control, and missing test. Do not claim a system is "secure"; state
the scope reviewed and residual risk.

## Streamer Adapter

- Never persist or log resolved media URLs, magnets, info hashes, raw `Stream`
  objects, or bridge URLs.
- Preserve add-on source-safety checks and deny private-network add-ons in
  production defaults.
- Keep Electron renderers sandboxed and context-isolated. Do not expose raw
  `ipcRenderer`, accept arbitrary renderer origins, or add unvalidated IPC.
- Validate privileged IPC senders and expose narrow typed preload methods.
- Keep the API bridge supervisor opt-in and Electron's sidecar ownership intact.
- Treat Sentry and other telemetry as read-only evidence. Apply the same data
  minimization rules to queries and agent output.
- Never run integration tests against development or production databases.
- Follow `docs/ELECTRON_SECURITY.md`, `PLAYBACK.md`, and the dependency policy
  for affected changes.

Run focused package tests first. Use `npm run security:install-scripts` and
`npm run security:audit` for dependency or release-sensitive changes, then the
appropriate broader verification.

## Completion Evidence

Report:

- assets and trust boundaries reviewed;
- abuse cases and controls added;
- security tests and scans run;
- findings accepted or deferred with owner and rationale;
- residual risk and runtime checks not performed.
