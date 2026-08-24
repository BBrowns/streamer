# Architecture Standards Baseline

Use this as a decision aid, not a checklist that forces unnecessary ceremony.

## Quality Attributes

Name the attributes that actually constrain the change:

- correctness and data integrity;
- security and privacy;
- availability, resilience, and recoverability;
- latency, throughput, and resource efficiency;
- evolvability, compatibility, and reversibility;
- operability, diagnosability, and deployability;
- accessibility and usability for user-facing systems.

Make tradeoffs explicit. "Scalable", "clean", and "future-proof" are not useful
requirements without a scenario and measurable consequence.

## Boundary Review

Verify:

- one accountable owner for each responsibility and state transition;
- contracts are smaller and more stable than their implementations;
- dependencies point toward policy rather than volatile infrastructure where
  practical;
- failures do not silently cross boundaries;
- retries are bounded and safe;
- state transitions define idempotency, ordering, and concurrency;
- observability answers operational questions without exposing sensitive data;
- the design can be migrated and rolled back safely.

## Change Shape

Select repair, refactor, split, merge, or replacement from evidence about
responsibility, coupling, lifecycle, failure isolation, and platform fit. A
larger change is justified when it removes a structural cause and has a bounded
migration. A rewrite is not justified merely by unfamiliar or untidy code.

Preserve explicit user, data, security, and compatibility contracts through
characterization tests and staged evolution. Retire temporary compatibility
paths once their evidence threshold is met.

## Resilience Playbook

For a boundary that can fail independently, define:

- timeout and cancellation ownership;
- retry eligibility, maximum attempts, backoff, jitter, and a retry budget;
- idempotency and duplicate handling;
- queue or concurrency bounds and backpressure;
- partial-failure and degraded-mode behavior visible to the user;
- circuit-breaker or isolation behavior when repeated failure can cascade;
- recovery, cleanup, observability, and rollback.

Retries must be bounded, safe, and performed by one accountable layer. Do not
multiply retries across callers and dependencies. Validate failure behavior with
controlled tests before introducing broad fault injection or chaos experiments.

## Decision Record Threshold

Record decisions that are durable, cross-team, difficult to reverse, or
security-sensitive. Include:

1. Context and decision drivers.
2. Options considered.
3. Decision and rationale.
4. Positive and negative consequences.
5. Migration, rollback, and revisit conditions.

## Primary References

- [AWS Well-Architected general design principles](https://docs.aws.amazon.com/wellarchitected/latest/framework/general-design-principles.html)
- [AWS Well-Architected framework pillars](https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html)
- [Google Cloud Well-Architected Framework](https://docs.cloud.google.com/architecture/framework)
- [Architecture Decision Records](https://adr.github.io/)
- [C4 model for software architecture](https://c4model.com/)
