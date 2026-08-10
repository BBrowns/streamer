# ADR-0006: Plan Explicit Execution Targets And Delivery Modes

- Status: Accepted
- Date: 2026-08-01

## Context

A media URL alone cannot explain whether a source runs on-device, in the
desktop sidecar or on a paired bridge, nor whether seek, tracks, cast, offline
or thumbnail behavior is available. URL sniffing and scattered platform checks
caused late failures.

## Decision

Planner v3 selects both a candidate and a `PlaybackRoute`. The route contains
an execution target, delivery and explicit capabilities. Clients validate the
full route and action eligibility before preparation. Runtime capability is the
intersection of the route, source runtime and concrete media-player adapter.

Planner v2 remains accepted through one bounded compatibility adapter while v3
rolls out. A v3 route never silently downgrades to legacy URL inference.

## Consequences

- Unsupported routes fail in planning or preparation with typed reasons.
- Direct, HLS, local-sidecar and paired-bridge execution are explainable and
  testable. Debrid, offline-file and remote-bridge types are modeled but remain
  unavailable until their adapters and evidence exist.
- Seek and track behavior is data-driven. Legacy inference applies only when no
  v3 route exists.
- Route contracts remain URL-free and safe to expose to presentation code.
