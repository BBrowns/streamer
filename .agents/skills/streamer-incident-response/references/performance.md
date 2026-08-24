# Performance Standards Baseline

Performance is an observable user and system property. Use representative
measurements and make tradeoffs explicit.

## Measurement Quality

- Define the scenario before the metric.
- Compare the same build, device class, data shape, network conditions, and
  cache state.
- Use multiple samples and retain enough raw evidence to inspect variance.
- Let observed variance and decision risk determine sample count; avoid a fixed
  run count for every task.
- Profile before optimizing and re-profile after each material change.
- Prefer user-centric stage timings over one aggregate duration.
- Treat development-mode results as diagnostic, not release evidence.

## Optimization Quality

- Remove, defer, bound, or batch work before adding machinery.
- Keep caches bounded and observable.
- Keep concurrency bounded and cancellation-aware.
- Include memory, battery, startup, correctness, and operational cost in the
  tradeoff.
- Put regression gates only around stable measurements; noisy gates create
  ignored failures and slow delivery.
- Revisit component boundaries when profiles repeatedly show cross-boundary
  churn, duplicate work, or misplaced state ownership.

## Primary References

- [React Native performance overview](https://reactnative.dev/docs/performance)
- [React Native DevTools](https://reactnative.dev/docs/react-native-devtools)
- [Chrome DevTools performance analysis](https://developer.chrome.com/docs/devtools/performance)
- [Web Vitals](https://web.dev/articles/vitals)
