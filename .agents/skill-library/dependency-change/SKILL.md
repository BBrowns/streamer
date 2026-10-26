---
name: dependency-change
description: Use when adding, removing, upgrading, pinning, overriding, or patching dependencies, or changing manifests, lockfiles, install approvals, native packages, or audit exceptions. Do not use for import-only edits.
---

# Dependency Change

Change the dependency graph without creating toolchain, security, or compatibility drift. Follow the target project's ecosystem, package manager, runtime requirements, and verification commands; do not introduce another toolchain to follow this skill.

When a project overlay accompanies this core, read both as one workflow. Apply its specific constraints and existing user authorization without adding a second approval step for the same action.

## Workflow

1. Read the installed version, target release notes, and migration guide through available authoritative documentation. Identify why the change is needed and the smallest compatible target; consider replacement when a pin only postpones a structural problem.
2. Check runtime/compiler support, platform and architecture coverage, peers, native interfaces, public APIs, configuration, and data compatibility as applicable. For JavaScript or native frontend toolchains, read [references/javascript.md](references/javascript.md).
3. Update the manifest and corresponding lockfile together where the ecosystem uses them. Inspect resolved transitive changes, overrides, patches, lifecycle/build scripts, new permissions, and generated artifacts. Avoid unrelated resolution churn.
4. Use the project's installation and runtime entrypoints. Run its install policy, compatibility checks, production audit or equivalent, affected tests and static checks, and relevant runtime/platform smoke checks. Keep production and development findings distinct.
5. Accept a security exception only when no safe compatible remediation exists. Record exact scope, owner, mitigation, review deadline, and removal condition. Give temporary overrides and patches a test and removal condition as well.

Read [references/dependencies.md](references/dependencies.md) for major upgrades, native changes, overrides, patches, or exceptions.

Use an installed, applicable security or contract specialist when the change alters execution privileges, trust, released APIs, or serialized shapes. Otherwise perform the relevant analysis directly; additional skills are optional.

## Completion

Report old and new versions, compatibility evidence, manifest/lockfile/patch changes, policy and audit results, focused runtime checks, unavailable platform evidence, and rollback or exception expiry.
