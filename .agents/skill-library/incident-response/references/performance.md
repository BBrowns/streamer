# Performance Standards Baseline

Performance is an observable user and system property. Use representative
measurements and make tradeoffs explicit.

## Measurement Quality

- Define the scenario before the metric: request, job, query, startup, rendering,
  or another observable operation relevant to the target system.
- Compare the same build, runtime or device class, workload/data shape, network
  conditions, and cache state.
- Use multiple samples and retain enough privacy-safe raw evidence to inspect
  variance, including relevant tail behavior and throughput under load.
- Let observed variance and decision risk determine sample count; avoid a fixed
  run count for every task.
- Profile before optimizing and re-profile after each material change. Choose
  CPU, allocation, I/O, query, queue, or rendering profiles from the observed
  bottleneck, using tools available in the target ecosystem.
- Prefer user-centric stage timings over one aggregate duration.
- Treat development-mode results as diagnostic, not release evidence.

## Optimization Quality

- Remove, defer, bound, or batch work before adding machinery.
- Keep caches bounded and observable.
- Keep concurrency bounded and cancellation-aware.
- Include memory, energy use, startup, correctness, and operational cost in the
  tradeoff.
- Put regression gates only around stable measurements; noisy gates create
  ignored failures and slow delivery.
- Revisit component boundaries when profiles repeatedly show cross-boundary
  churn, duplicate work, or misplaced state ownership.

## Primary References

- [Google SRE monitoring distributed systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [USE method for resource analysis](https://www.brendangregg.com/usemethod.html)
