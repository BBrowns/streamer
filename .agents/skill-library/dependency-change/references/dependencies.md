# Dependency Upgrade Standards Baseline

Use this reference for dependency decisions that exceed a routine, compatible
patch update.

## Decision Factors

- Necessity: required capability or risk reduction versus optional convenience.
- Compatibility: runtime, peer, native, API, configuration, and data contracts.
- Security: known advisories, privileges, lifecycle/build scripts, provenance,
  and transitive exposure.
- Sustainability: maintenance, release quality, ecosystem support, and an exit
  path if the package stalls.
- Cost: bundle or binary size, startup, memory, build time, operational burden,
  and migration effort.

Popularity is context, not proof. Latest is a candidate, not a decision.

## Change Discipline

- Keep the project's package manager and lockfile authoritative and reproducible.
- Inspect both the semantic manifest change and resolved transitive diff.
- Prefer the smallest compatible remediation, but replace a structurally unsafe
  or abandoned dependency when a pin only defers the problem.
- Treat lifecycle/build scripts and native binaries as executable third-party code.
- Give overrides, patches, and audit exceptions an owner, rationale, exact
  scope, test, and removal condition.
- Verify production and development findings separately; severity alone does
  not describe reachability or migration risk.
- Scale the platform matrix to the delivery stage: representative runtime plus
  CI for development, complete affected shipping coverage for release evidence.

## Maintenance Triage

Treat package manifests, lockfiles, patches, and install policy as one install
contract. Run the project's dependency install preflight, when provided, before
interpreting downstream CI failures. Routine compatible patch/minor updates may
remain grouped; coordinated runtime, framework, compiler, native, or test-tool
changes need an explicit compatibility decision because semver grouping cannot
model their full graph.

## Primary References

- [GitHub dependency-change review](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-dependency-changes-in-a-pull-request)
- [SLSA supply-chain framework](https://slsa.dev/spec/)
