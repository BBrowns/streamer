---
name: streamer-dependency-upgrades
description: Use when adding, removing, replacing, pinning, overriding, patching, or upgrading an npm dependency; changing package manifests or lockfiles; resolving npm audit findings; reviewing install scripts, provenance, licenses, peer dependencies, engines, or native modules; or planning Expo, Electron, Prisma, Vite, WebTorrent, React Native, or other framework migrations.
---

# Streamer Dependency Upgrades

Change dependencies as controlled migrations. Optimize for a supported,
reproducible runtime and reduced total risk, not the highest possible version.

Read `references/standards.md` for a new dependency, major upgrade, native or
privileged package, audit exception, override, or package replacement. A narrow
patch update can stay on this workflow.

## Relationship To Other Skills

- Use `get-api-docs` to read exact target-version migration and API guidance.
- Use `streamer-security-review` for exploitability, trust, permission, or
  supply-chain analysis.
- Use `streamer-architecture-guardrails` when replacing a dependency changes
  ownership, persistence, runtime, protocol, or platform boundaries.
- Use `streamer-test-strategy` for the affected compatibility and runtime test
  matrix.

Do not trigger this skill merely because normal implementation imports an
already approved dependency without changing its version or role.

## Workflow

### 1. Define The Reason And Scope

Classify the change as vulnerability remediation, defect fix, required feature,
platform compatibility, maintenance, or package retirement. Identify:

- direct and transitive package paths;
- owning workspaces and shipped versus development use;
- current and target versions and release distance;
- engines, peers, native binaries, lifecycle scripts, patches, and overrides;
- runtime, build, test, and release surfaces that depend on the package.

Capture a relevant baseline before changing anything. Do not mix unrelated
upgrades or formatting churn into the same change.

### 2. Research The Exact Target

- Use curated or official version-specific documentation and release notes.
- Inspect migration guides, peer ranges, engine support, deprecations, default
  changes, security advisories, and known platform limitations.
- Review package provenance, repository activity, maintainer changes, license,
  install scripts, and the transitive dependency delta when risk warrants it.
- Verify claims against the resolved lockfile and installed package, not only a
  package-page summary.

Do not run an automatic major remediation or `npm audit fix --force` as a
substitute for review. A security upgrade that silently changes framework or
runtime contracts is still a migration.

### 3. Choose Upgrade, Pin, Patch, Or Replace

- Upgrade when a supported target preserves the required contracts.
- Pin or override only with a documented compatibility reason and a removal
  condition.
- Patch only a narrow upstream defect that is covered by a local test; track
  when the patch can be removed.
- Replace a dependency when maintenance, security, architecture, or platform
  fit is structurally weak and another package lowers lifecycle cost.
- Remove the dependency when existing platform or repository capabilities make
  it unnecessary.

For a replacement, compare migration cost, API fit, runtime support, security,
maintenance, bundle or binary impact, and rollback. Do not preserve a poor
package boundary solely to keep the diff small.

### 4. Apply The Change Deliberately

- Use Node 24.18 and npm 11.18 through the repository runtime guard.
- Change only intended manifests, lockfile entries, patches, overrides, and
  install-script policy.
- Inspect the resolved dependency tree and lockfile diff for unexpected
  packages, registries, versions, binaries, or lifecycle scripts.
- Update code and configuration according to the target version, including
  removal of obsolete compatibility shims.
- Keep a framework major or repository-wide formatting change in a dedicated
  migration unless the user explicitly requests a combined change.

### 5. Verify In Expanding Rings

Run, as applicable:

1. Import, construction, or configuration smoke test.
2. Focused owner tests and typecheck.
3. Affected consumer and workspace tests.
4. Native, Electron, browser, database, or bridge runtime checks.
5. `npm run security:install-scripts` and `npm run security:audit`.
6. `npm run verify:quick`, then `npm run verify:full` for release-level changes.

Compare the result with the baseline. A successful install alone is not upgrade
evidence.

For a development pull request, test the affected runtime on the available
representative platform and rely on the relevant CI matrix. Require every
shipping OS, architecture, or device only when the package is platform-specific
or the work is being promoted as a release candidate; record the deferred matrix
instead of blocking unrelated iteration.

## Streamer Adapter

- Read `docs/DEPENDENCY_SECURITY.md` before dependency changes.
- Preserve the exact Node/npm runtime, CPU architecture, and native repair flow.
- Review Expo, Electron, Prisma, Vite, WebTorrent, cast, and native-module majors
  as dedicated migrations with runtime evidence.
- Re-evaluate advisory exceptions, `allowScripts`, `overrides`, and
  `patch-package` entries when their owning package changes.
- Never broaden an install-script approval or force an incompatible transitive
  version merely to make CI green.

## Completion Evidence

Report:

- reason, current/target versions, owners, and dependency path;
- release notes, migration concerns, and selected strategy;
- manifest, lockfile, script, override, or patch changes;
- focused, security, runtime, and broader checks run;
- remaining exception, compatibility, provenance, or device risk.
