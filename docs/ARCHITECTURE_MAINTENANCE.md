# Architecture Maintenance

The repository enforces a 900-line budget for production modules below
`server/src/modules`. The budget is a review trigger, not a demand for
mechanical splitting. A change that crosses ownership, lifecycle, trust, or
dependency boundaries still requires the architecture guardrails workflow.

`server/src/modules/aggregator/aggregator.service.ts` is the only current
exception. It is a central legacy boundary with extensive characterization
coverage, an owner in the server platform group, and a review deadline of
2026-09-30. Its intended decomposition order is:

1. upstream fetch and response validation;
2. search normalization, ranking, and cache state;
3. subtitle candidate and document retrieval;
4. stream discovery, source normalization, and resolution.

Each extraction must preserve URL-free persistence and redacted diagnostics,
keep controller contracts stable, and add focused consumer tests before moving
the next responsibility. The exception is not permission to increase the file
size; the budget check fails above 2,300 lines.
