# Architecture Maintenance

The repository enforces a 900-line budget for production modules below
`server/src/modules`. The budget is a review trigger, not a demand for
mechanical splitting. A change that crosses ownership, lifecycle, trust, or
dependency boundaries still requires the `streamer-change-design` workflow.

The aggregator now keeps `AggregatorService` as a compatibility façade while
separate modules own upstream request validation, add-on data access, search
and its bounded caches, subtitle retrieval, and stream discovery. The former
`aggregator.service.ts` exception has been removed; there are no active
production-module exceptions in the budget file. Keep URL-free persistence,
redacted diagnostics, and the current controller and planner contracts intact
when extending these services.
