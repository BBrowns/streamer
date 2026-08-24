# Delivery Standards Baseline

## Git Hygiene

- Work from the intended base and keep branch scope explicit.
- Review staged content before every commit.
- Keep commits coherent, buildable where practical, and reversible.
- Never mix secrets, generated noise, or unrelated user changes into the task.
- Avoid force pushes and shared-history rewrites by default.
- Use commit messages to preserve intent, not narrate file operations.

## Pull Request Quality

A reviewable pull request provides:

- a bounded problem and outcome;
- enough context to understand the design;
- explicit risk and migration behavior;
- verification tied to changed behavior;
- screenshots or runtime evidence where code inspection is insufficient;
- honest gaps and follow-up work.

Repository rulesets, protected branches, required checks, code owner review, and
security checks are controls. Do not bypass them to achieve a nominal green
state.

## Release Quality

Before a release claim, verify:

- the exact artifact and commit being released;
- required tests and security checks against that revision;
- migrations, configuration, and compatibility;
- observability and rollback;
- user-facing documentation and known limitations;
- provenance and dependency changes.

Represent each release requirement as passed, failed, not run, or not
applicable. Tie receipts to the exact commit and artifact, keep environment or
device evidence explicit, and separate evidence generation from evidence
review. A conditional release decision needs an owner, expiry, observation
signal, and recovery action for every accepted risk.

## Primary References

- [GitHub repository best practices](https://docs.github.com/en/repositories/creating-and-managing-repositories/best-practices-for-repositories)
- [GitHub pull request standardization](https://docs.github.com/en/pull-requests/reference/managing-and-standardizing-pull-requests)
- [GitHub protected branches](https://docs.github.com/en/pull-requests/reference/branches)
- [GitHub required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)
