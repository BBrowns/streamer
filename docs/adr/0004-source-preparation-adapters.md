# ADR-0004: Separate Source Preparation From Media Playback

- Status: Accepted
- Date: 2026-08-01

## Context

Direct URLs, HLS, on-device engines and bridge jobs have different preparation
and cleanup semantics. Letting player code resolve them directly duplicates
engines, leaks media details and makes fallback races possible.

## Decision

Use `SourcePreparer` to select one adapter for the exact planned route. An
adapter returns a `PreparedSource` lease containing the runtime media source,
safe route, optional opaque bridge job ID/runtime and one idempotent release
operation. Direct, HLS, legacy compatibility and bridge v1 implement the same
contract.

The session service owns every lease. It adopts a result only when session,
candidate, attempt and complete route still match. Late or mismatched results
are released immediately. Player bindings receive an attempt-scoped runtime
handoff, not the lease itself.

## Consequences

- Preparing a source cannot manipulate player UI state.
- Fallback remains serial and per-session single-flight.
- Cancellation has one cleanup owner and cannot silently create a second
  engine.
- Debrid, offline-file and remote-bridge adapters can be added without changing
  the player port; unsupported routes remain rejected until implemented.
