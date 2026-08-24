---
name: streamer-change-design
description: Use before planning a material or ambiguous Streamer change that alters ownership, state lifecycle, dependency direction, or a durable runtime boundary. Do not use for small fully specified fixes or routine compatible contract changes.
---

# Streamer Change Design

Make consequential changes decision-complete before implementation. Preserve user intent, safety, compatibility, and explicit ownership without forcing design ceremony onto local work.

## Use

Use for broad features, component or service reshaping, package splits or merges, state-owner changes, durable migrations, and refactors whose desired outcome or acceptance criteria are not yet complete.

Skip this skill for trivial fixes, documentation corrections, isolated implementation details, and changes already owned by a more specific skill. A routine compatible serialized change starts with `streamer-contract-change`.

## Workflow

1. Read the relevant source, tests, `ARCHITECTURE.md`, and subsystem contract. Use Graphify only when an up-to-date graph exists.
2. State the user outcome, observable acceptance criteria, non-goals, facts, assumptions, and affected quality attributes.
3. Identify the current and proposed owner, public contract, state lifecycle, dependency direction, runtime/trust boundary, and failure behavior.
4. Compare the status quo with the recommended option. Add a third option only when it represents a real tradeoff.
5. Choose repair, refactor, split, merge, or replacement from evidence such as recurring incidents, change amplification, unstable adapters, or measured constraints.
6. Define migration, rollback limits, characterization tests, and the owner plus removal condition for every temporary path.
7. Produce one implementation plan with unresolved product decisions closed.

For a consequential architecture decision, read [references/architecture.md](references/architecture.md). For ambiguous product framing, read [references/framing.md](references/framing.md).

## Routing

Use every project specialist whose trigger applies; safety, contract, and
compatibility coverage must never be dropped to satisfy a count. Limit only
optional external or exploratory specialists to at most two:

- serialized/API/IPC/persisted shape → `streamer-contract-change`;
- timeout/retry/cancellation/recovery → `streamer-reliability-change`;
- trust, privilege, untrusted input, or sensitive data → `streamer-security-boundaries`;
- manifests/lockfiles/native packages → `streamer-dependency-change`;
- renderer or mobile presentation → `streamer-ui-change`.

## Completion

Report the chosen owner and boundary, material tradeoffs, compatibility and rollback, verification strategy, residual risk, and any temporary path with its removal condition.
