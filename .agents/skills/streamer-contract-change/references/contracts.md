# Contract Evolution Standards Baseline

Use this reference for consequential contract changes. Compatibility is a
product and deployment decision, not an obligation to preserve every accidental
implementation detail forever.

## Compatibility Dimensions

- **Source:** existing consumers still compile or typecheck.
- **Wire:** old and new endpoints can serialize and parse required messages.
- **Validation:** previously valid required inputs remain valid during the
  compatibility window.
- **Semantic:** defaults, ordering, errors, and field meaning remain usable.
- **Storage:** existing persisted data can be read, migrated, and rolled back as
  promised.

State which dimensions apply and how long. Internal, atomically deployed code
can use a shorter compatibility window than mobile clients or persisted data.
Discovery is complete when owners, independently evolving consumers, durable
data, and trust boundaries are known; exhaustive internal call-graph coverage
is not a prerequisite for choosing the transition.

## Evolution Rules

- Prefer additive changes with backward-compatible defaults.
- Treat rename as add, migrate, then remove.
- Make readers tolerant only where ambiguity cannot hide corruption.
- Keep one current internal model; isolate legacy translation at boundaries.
- Use expand, migrate, observe, and contract for overlapping deployments.
- Rehearse destructive data changes and define the point after which rollback
  requires a forward repair.
- Remove compatibility code when its explicit evidence threshold is met.

Contract tests prove consumer-visible interactions. They complement rather than
replace integration tests for serialization, persistence, process, or framework
behavior.

## Primary References

- [Google AIP-180: Backwards compatibility](https://google.aip.dev/180)
- [Prisma expand-and-contract migrations](https://docs.prisma.io/docs/guides/database/data-migration)
- [Pact contract-testing FAQ](https://docs.pact.io/faq)
