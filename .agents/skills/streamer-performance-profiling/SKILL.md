---
name: streamer-performance-profiling
description: Use when diagnosing or changing user-visible latency, startup time, render or animation jank, list performance, playback startup or seeking, memory growth, CPU use, network or bridge latency, server throughput, bundle size, build time, or another measurable performance regression in React Native, Expo, Electron, web, Node, or stream-server code. Trigger for profiling, benchmarking, performance budgets, leak analysis, and evidence-backed optimization.
---

# Streamer Performance Profiling

Optimize from a reproducible user problem and measured bottleneck. Do not add
memoization, caching, concurrency, or architectural complexity from intuition
alone.

Read `references/standards.md` before setting a durable budget, changing a hot
cross-runtime path, or accepting a performance tradeoff. A narrow diagnosed fix
can stay on this workflow.

## Relationship To Other Skills

- Use `vercel-react-native-skills` only for applicable React Native or Expo
  rendering, list, animation, image, or native-module guidance.
- Use `streamer-ui-quality` when the change affects user interaction,
  accessibility, responsive behavior, or visual output.
- Use `streamer-architecture-guardrails` when the bottleneck requires changing
  ownership, state lifecycle, process boundaries, or data flow.
- Use `streamer-test-strategy` for functional regression coverage around the
  optimized behavior.

Do not trigger this skill for hypothetical micro-optimization without a user
scenario, regression, budget, or credible high-cost path.

## Workflow

### 1. Define The Performance Contract

State:

- user action or workload;
- affected platform, device class, runtime, and build mode;
- metric and observation point;
- acceptable target or regression threshold;
- functional, security, battery, memory, and maintainability constraints.

Separate latency, throughput, frame pacing, startup, memory, network, and build
problems. A single change rarely improves all dimensions.

### 2. Reproduce And Baseline

- Use representative data and the narrowest deterministic flow that exposes the
  symptom.
- Measure a production-like build where development instrumentation distorts
  results.
- Warm up when appropriate, record sample count and variance, and compare like
  conditions.
- Use the smallest sample count that separates signal from normal variance; do
  not impose a fixed benchmark ritual when a few controlled runs answer the
  decision.
- Capture profiles, traces, or counters that can localize time or resources.
- Verify the symptom before changing code. If it cannot be reproduced, improve
  instrumentation or narrow the claim instead of guessing.

### 3. Find The Bottleneck

Trace the critical path across relevant owners. Distinguish:

- work that is slow from work that runs too often;
- CPU, allocation, I/O, network, serialization, bridge, and rendering cost;
- queueing and contention from execution time;
- one-time startup from steady-state behavior;
- retained memory from expected cache growth;
- local cost from a downstream or platform bottleneck.

Form one falsifiable hypothesis at a time and select the tool that can disprove
it.

### 4. Choose The Change Shape

- Remove unnecessary work before making necessary work faster.
- Prefer bounded data, virtualization, batching, streaming, cancellation, and
  correct ownership over broad caching.
- Add caches only with an owner, key, size bound, invalidation rule, and memory
  consequence.
- Add concurrency only with limits, ordering, cancellation, and backpressure.
- Preserve behavior with focused tests before a structural optimization.

Refactor, split, merge, or replace a component when the profile shows that its
responsibility or boundary creates the bottleneck. Compare that option with a
local repair, define compatibility and rollback, and remove the obsolete path
after migration. Performance evidence may justify redesign; it does not excuse
an unbounded rewrite.

### 5. Verify The Result

- Repeat the same workload and measurement conditions.
- Report before, after, variance, and tradeoffs rather than only a percentage.
- Run functional, failure-mode, and resource-bound checks.
- Add a stable regression check when the metric can be measured reliably in CI;
  otherwise document the reproducible profiling procedure.
- Remove temporary profiling data and ensure permanent telemetry is bounded and
  persistence-safe.

Reject a change that moves cost outside the measured window while degrading
startup, memory, battery, correctness, or another critical platform.

## Streamer Tool Routing

- React Native or Expo: profile the affected JS and UI threads with React Native
  DevTools and verify important claims in a release build on the relevant device
  class.
- Electron renderer or web: use Chrome DevTools for CPU, rendering, memory, and
  network diagnosis; use Playwright for deterministic flows and screenshots.
- Electron main process or Node services: use Node CPU, heap, event-loop, and
  process metrics around a controlled workload.
- Playback and bridge paths: measure discovery, planning, startup, seek, cast,
  download, and handoff stages separately. Never include resolved media URLs,
  magnets, info hashes, or bridge URLs in traces or reports.
- Do not run load tests against development or production databases or services.

## Completion Evidence

Report:

- scenario, platform, build mode, metric, and target;
- baseline, profile evidence, and diagnosed bottleneck;
- chosen optimization or component redesign and rejected alternative;
- before/after result with variance and tradeoffs;
- functional checks and remaining unmeasured device or production risk.
