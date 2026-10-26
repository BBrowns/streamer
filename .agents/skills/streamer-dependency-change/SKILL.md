---
name: streamer-dependency-change
description: Use when adding, removing, upgrading, pinning, overriding, or patching an npm dependency, or changing manifests, lockfiles, install-script approval, native packages, or audit exceptions. Do not use for import-only edits.
---

# Streamer Dependency Change

Read the [portable core](../../skill-library/dependency-change/SKILL.md) and apply this overlay with it as one workflow. Existing task authorization carries through both.

## Project Constraints

- Use Context Hub first for curated API references; otherwise use Context7 with the exact library version. Read release notes and migrations before choosing the target.
- Preserve the repository's Node/npm requirements, Expo/React Native, Electron, native architecture, peer dependencies, and supported platforms. Read [dependency security policy](../../../docs/DEPENDENCY_SECURITY.md).
- Use repository installation/runtime scripts; never bypass `scripts/dev-runtime.cjs` for native bridge work. Preserve Electron ownership of its bridge sidecar and opt-in API supervision.
- Run `npm run security:install-scripts`, `npm run dependency:compatibility:test`, `npm run security:audit`, affected workspace tests/typechecks, and applicable native/Electron smoke checks. Use `streamer-verification` for mapped evidence; do not claim unrun device validation.
- Keep install approvals version-pinned. Security exceptions require exact scope, owner, mitigation, review deadline, and removal condition. Keep production and development findings distinct.
- Never persist or log resolved media URLs, magnets, info hashes, raw `Stream` objects, or bridge URLs.

## Project Routing

Use `streamer-security-boundaries` for new permissions, executable/install behavior, untrusted network reach, or material trust changes; `streamer-contract-change` for released APIs or serialized shapes. Avoid unrelated lockfile churn. Report the core's completion evidence with project command results and skipped device evidence.
