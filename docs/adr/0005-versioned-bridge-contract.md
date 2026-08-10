# ADR-0005: Access The Media Bridge Through A Versioned Contract

- Status: Accepted
- Date: 2026-08-01

## Context

The current bridge uses Node, WebTorrent and FFmpeg, but clients should not
depend on those objects or process internals. Bridge responses cross a trust
boundary and may contain runtime-sensitive media data.

## Decision

Expose bridge protocol v1 through shared Zod schemas and a typed client. The
contract includes hello/capability negotiation, opaque jobs, explicit delivery
and readiness, bounded metrics, track/subtitle/thumbnail resources, typed
errors and cancellation.

`BridgeV1PlaybackRuntime` binds one prepared opaque UUID to one approved origin
and delivery. Signed stream URLs are short-lived runtime values. The public job
DTO does not expose magnets, hashes, selected-file paths or implementation
objects. Authenticated requests reject redirects; binary resources require a
valid bounded length and expected media signature.

## Consequences

- The bridge implementation is replaceable without rewriting client playback.
- Runtime stop aborts observation; the prepared-source lease owns job deletion.
- Protocol v2 can be introduced additively. Protocol v1 consumers fail closed
  on mismatched versions or schemas.
- Legacy bridge compatibility is temporary and should be removed only after
  migration evidence, not maintained as a permanent parallel architecture.
