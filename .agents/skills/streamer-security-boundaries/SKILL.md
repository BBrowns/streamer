---
name: streamer-security-boundaries
description: Use when a Streamer change modifies a trust or privilege boundary or the handling of authentication, authorization, untrusted input or URLs, network/IPC exposure, sensitive persistence or telemetry, files, processes, secrets, permissions, or release hardening. Do not use merely because unchanged code runs in Electron or a bridge.
---

# Streamer Security Boundaries

Review the changed trust and privilege boundary, not every ordinary code path.

## Workflow

1. Map attacker-controlled inputs, protected assets, actors, trust transitions, privileges, storage, logs, and outbound destinations.
2. Define concrete abuse cases and impact. Separate exploitable findings from defense-in-depth opportunities.
3. Verify validation, authentication, object/function authorization, destination controls, least privilege, resource bounds, safe errors, and data minimization.
4. Preserve Electron isolation: no raw `ipcRenderer`, arbitrary remote renderer origins, or unreviewed IPC handlers.
5. Preserve playback privacy: never persist or log resolved media URLs, magnets, info hashes, raw streams, or bridge URLs.
6. Add tests or static checks at the boundary. Use explicit Codex Security diff/full scans only when requested or proportional to high risk.

Read [references/security.md](references/security.md) for consequential reviews. Read `docs/ELECTRON_SECURITY.md` for desktop work and `docs/DEPENDENCY_SECURITY.md` for supply-chain policy.

## Boundaries

Use `streamer-dependency-change` for routine package provenance, audit, and install-script checks. Use `streamer-incident-response` when exploitation or active user impact is suspected. Do not treat a scan result as validated without reachability and source evidence.

## Completion

Report assets and trust boundaries reviewed, validated findings with severity, controls and tests, scan limitations, residual risk, and any authorization still needed for external actions.
