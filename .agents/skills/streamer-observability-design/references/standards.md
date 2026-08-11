# Observability Standards Baseline

Use this as a design reference, not as a requirement to adopt a new telemetry
vendor or instrument every layer.

## Signal Selection

Start with user and operator questions, then select the cheapest signal that can
answer them:

- **Metrics:** aggregate rates, latency distributions, outcomes, saturation, and
  SLO calculation.
- **Traces:** causality and latency across meaningful operation boundaries.
- **Logs:** discrete diagnostics that need richer context or durable auditability.
- **Events or breadcrumbs:** ordered product and runtime transitions around a
  failure.

Correlate signals with stable release, environment, platform, operation, and
outcome fields. Do not duplicate the same high-volume payload across every
signal type.

## Naming And Cardinality

- Name operations by stable behavior, not raw routes or implementation classes.
- Use explicit units and histogram boundaries tied to user-relevant thresholds.
- Keep attribute keys stable and values enumerable where possible.
- Put exception text, URLs, IDs, and other unbounded values outside metric
  dimensions.
- Model expected outcomes as status or outcome fields; reserve errors for failed
  operations.

## SLI And SLO Design

A useful SLI states:

1. Population: which attempts or users count.
2. Good event: the user-visible success or latency condition.
3. Window: rolling or calendar period.
4. Exclusions: narrowly justified conditions outside product control.
5. Data quality: missing, sampled, duplicated, or delayed evidence.

Begin with a few critical journeys. Targets should support prioritization and
error-budget decisions, not claim perfect availability.

## Alert Quality

Every alert needs an owner, severity, impact statement, investigation entrypoint,
safe first actions, and a recovery condition. Avoid paging on raw CPU, one-off
exceptions, or a single regional failure unless those directly predict user
impact. Test routing and deduplication as well as the query.

## Primary References

- [OpenTelemetry concepts](https://opentelemetry.io/docs/concepts/)
- [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/)
- [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Google SRE: Implementing SLOs](https://sre.google/workbook/implementing-slos/)
- [Google SRE: Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
