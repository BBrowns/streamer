---
name: streamer-dependency-change
description: Use when adding, removing, upgrading, pinning, overriding, or patching an npm dependency, or changing manifests, lockfiles, install-script approval, native packages, or audit exceptions. Do not use for import-only edits.
---

# Streamer Dependency Change

Change the dependency graph without creating toolchain, native, security, or compatibility drift.

## Workflow

1. Read the installed version, target release notes and migration guide through the configured API-doc tools. Do not rely on remembered APIs.
2. Establish why the change is needed and the smallest compatible target. Check Node/npm, Expo/React Native, Electron, native architecture, peer dependencies, and supported platforms.
3. Update manifest and lockfile together. Inspect transitive, override, patch, lifecycle-script, permission, and generated-native changes.
4. Use the repository runtime wrappers; do not bypass `scripts/dev-runtime.cjs` for native bridge work.
5. Run install-script policy, dependency compatibility, production audit, affected package tests/typechecks, and relevant native/Electron smoke checks.
6. Document a security exception only when no safe compatible remediation exists; include exact scope, owner, mitigation, review deadline, and removal condition.

Read [references/dependencies.md](references/dependencies.md) for native upgrades, major versions, overrides, patches, or exceptions.

## Boundaries

Use `streamer-security-boundaries` only for new permissions, executable/install behavior, untrusted network reach, or a material trust change. Use `streamer-contract-change` when released APIs or serialized shapes change. Avoid unrelated lockfile churn.

## Completion

Report old and new versions, compatibility evidence, manifest/lockfile/patch changes, policy and audit results, focused runtime checks, skipped device evidence, and rollback or exception expiry.
