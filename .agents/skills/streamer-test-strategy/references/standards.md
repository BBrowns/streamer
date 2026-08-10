# Testing Standards Baseline

## Layer Selection

Use tests as a confidence portfolio:

- **Unit:** deterministic policy, transformation, and state logic.
- **Component:** rendered behavior, semantics, and user interaction in one UI
  boundary.
- **Contract:** producer-consumer schemas, protocol invariants, and
  compatibility.
- **Integration:** real framework, persistence, filesystem, process, or network
  behavior under controlled conditions.
- **End-to-end:** a small set of critical journeys through production-like
  wiring.
- **Exploratory or device:** behavior that automation cannot faithfully model.

Do not enforce a fixed pyramid ratio. Place tests where failures are precise and
the required behavior is genuinely exercised.

## Test Quality

A strong test:

- can fail against the defect it is intended to catch;
- asserts externally meaningful behavior;
- controls its own state;
- is deterministic under parallel and repeated execution;
- has a diagnostic name and focused failure;
- survives an internal refactor that preserves the contract;
- does not depend on another test's order or residue.

Use accessibility roles and visible names for UI queries. Prefer web-first
assertions and controlled data over manual polling or arbitrary delays.

## Generative Testing

Property-based testing is useful when examples cannot cover a meaningful input
space. Good properties include:

- parse then serialize preserves the supported value;
- normalization is idempotent;
- redaction never returns prohibited material;
- schemas accept every value produced by the supported builder and reject
  malformed boundary classes;
- a state-machine command sequence preserves invariants and reaches only valid
  observable states.

Use deterministic seeds, bounded run counts, domain-aware generators, and
shrinking. A property must express behavior independently of the production
implementation; duplicating the implementation in the oracle creates false
confidence.

## Resilience Testing

For network, process, persistence, and native boundaries, define the steady
state and introduce one controlled failure at a time. Cover only applicable
modes:

- timeout and slow response;
- bounded retry with backoff and jitter;
- cancellation during each material phase;
- duplicate, delayed, reordered, or lost events;
- dependency overload and backpressure;
- process restart or connection loss;
- partial success and graceful degradation;
- idempotent recovery without leaked work or corrupted state.

Keep fault injection isolated from development and production data. A chaos or
load experiment needs a measurable hypothesis, a small blast radius, abort
conditions, and cleanup.

## Primary References

- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Testing Library guiding principles](https://testing-library.com/docs/guiding-principles)
- [Testing Library query priority](https://testing-library.com/docs/queries/about)
- [Google testing blog: test sizes](https://testing.googleblog.com/2010/12/test-sizes.html)
- [fast-check property-based testing](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)
- [fast-check model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Principles of Chaos Engineering](https://principlesofchaos.org/)
