# Playback Control Plane

## Goal

Streamer should behave like a mainstream streaming app: the user chooses a
title, presses Play, and the app handles source selection, bridge preparation,
fallback, download preparation, and cast preparation without exposing source
complexity by default.

The playback control plane is being introduced incrementally. The first shared
contract is `PlaybackSession` in `@streamer/shared`.

## Runtime Plans Versus Persisted Sessions

`PlaybackPlan` and `MediaCandidate` are runtime planning contracts. A
`MediaCandidate` contains a full `Stream`, which may include short-lived or
sensitive fields such as URLs, magnet-derived identifiers, or external URLs.

`PlaybackSession` is the persistence-safe source of truth for one play,
download, or cast workflow. It stores:

- content and action
- ordered candidate snapshots
- attempt history
- gateway job identity
- device, bridge, and cast capability snapshots
- timeout budget
- typed terminal error
- typed event log

It deliberately does not store:

- `Stream`
- resolved media URLs
- manifest URLs
- magnet links
- info hashes
- external URLs
- bridge URLs

Resolved media URLs remain transient runtime data. They may expire, contain
credentials, or be unusable after an app restart.

## Identifier Rules

Session, candidate, attempt, event, and gateway job identifiers in persisted
sessions are opaque UUIDs.

Do not derive persisted candidate IDs from a URL, magnet, info hash, add-on
response, or another raw source identifier. Runtime code may keep a temporary
mapping from an opaque session candidate ID to a `MediaCandidate`, but that
mapping is not part of persisted session state.

## Schema Versioning

`PlaybackSession` starts at `schemaVersion: 1`.

Any future persisted shape change must either:

1. remain backwards compatible, or
2. add an explicit migration before increasing the schema version.

## Event Model

The event log is append-only and explains how a session reached its current
state. Events cover:

- session creation and status transitions
- candidate selection
- attempt start, ready, failure, and skip
- gateway job attachment and progress
- fallback transitions
- terminal failure, cancellation, and completion

Events must remain persistence-safe. Do not add raw source or media URLs to an
event payload or error message.

## Current And Future Ownership

Current code still uses `PlaybackPlanService`, `PlaybackOrchestrator`,
`playerStore`, and stream engines directly. Those contracts remain supported.

The intended migration sequence is:

1. Add the shared `PlaybackSession` contract.
2. Extend the planner with ordered, opaque candidates and decision rationale.
3. Add a client session store and typed event reducer.
4. Route Play Best through session-driven fallback and timeout behavior.
5. Route downloads and cast through the same session model.

XState is optional. Introduce it only if a typed reducer/service cannot keep
the shared lifecycle understandable and testable.
