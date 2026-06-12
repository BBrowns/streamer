# Playback Control Plane

## Goal

Streamer should behave like a mainstream streaming app: the user chooses a
title, presses Play, and the app handles source selection, bridge preparation,
fallback, download preparation, and cast preparation without exposing source
complexity by default.

The playback control plane is now session-first for the primary Play, Download,
and Cast flows. The shared contract is `PlaybackSession` in `@streamer/shared`.
Current work should keep hardening reliability and UX copy around this model
instead of replacing it.

## Runtime Plans Versus Persisted Sessions

`PlaybackPlan` and `MediaCandidate` are runtime planning contracts. A
`MediaCandidate` contains a full `Stream`, which may include short-lived or
sensitive fields such as URLs, magnet-derived identifiers, or external URLs.

Planner v2 returns:

- opaque UUID candidate IDs
- a deterministic `orderedCandidates` list
- top-level `selectedCandidate` and `fallbackCandidates`
- typed `rejectedCandidates` and decision reasons
- requested-action eligibility
- selected-path bridge, remux, and device compatibility details
- action-specific timeout budgets

Candidate ordering is deterministic for the same normalized source set and
device/action input. Candidate IDs are opaque and plan-local; callers must not
expect the same UUID across separate plan requests.

The top-level Planner v2 fields are canonical for new code. The nested `plan`
object remains temporarily for download/cast compatibility and its optional
direct playback URL. Server and client both validate the response with
`playbackPlanSchema`.

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

The mobile client now has:

- `services/playback/PlaybackSessionReducer.ts` for pure session creation,
  typed event reduction, lifecycle validation, and runtime-error sanitization
- `stores/playbackSessionStore.ts` for persisted sessions and active-session
  selection, typed event dispatch, attempt creation, gateway progress,
  fallback, failure, and cancellation helpers
- `services/playback/PlaybackSessionPlaybackService.ts` for Play Best and
  Download candidate resolution, planner timeout budgets, gateway progress,
  automatic fallback, active-engine cancellation, action-aware offline
  eligibility, and persistence-safe runtime error handling
- an in-memory runtime mapping from session-local candidate IDs to planner
  candidates

Only `PlaybackSession` records are persisted. Planner candidates and their raw
`Stream` values are kept in memory and are deliberately lost on restart. A
rehydrated session with candidates but without runtime mappings reports
`requiresReplan`; callers must request a new plan instead of trying to reuse
stale media data.

Do not confuse the shared playback control-plane `PlaybackSession` with the
legacy device-presence records named `PlaybackSession` in
`apps/mobile/hooks/useRemoteControl.ts` and
`server/src/modules/sessions/session.service.ts`. Those Redis-backed records
only describe remote-control presence and current position.

## Identifier Rules

Session, candidate, attempt, event, and gateway job identifiers in persisted
sessions are opaque UUIDs.

Do not derive persisted candidate IDs from a URL, magnet, info hash, add-on
response, planner candidate ID, or another raw source identifier. Runtime code
may keep a temporary mapping from an opaque session candidate ID to a
`MediaCandidate`, but that mapping is not part of persisted session state.

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

Play Best now creates a `PlaybackSession` in `PlaybackOrchestrator`, then the
player resolves candidates through `PlaybackSessionPlaybackService`.
`playerStore` keeps only transient session/candidate/attempt context and does
not use its legacy raw fallback queue for session-driven playback. Manual
advanced source playback remains supported separately.

Primary Download now creates and resolves a `PlaybackSession` through
`PlaybackOrchestrator` and records URL-free download progress, local-file
verification, completion, failure, and cancellation events. Manual advanced
source downloads remain separate.

`DownloadService` owns queue reconciliation and the verified-offline invariant:
a task is offline-playable only after its local URI exists and has been
verified. The persisted mobile queue stores task state for UI recovery, while
Electron persists managed download-job metadata and restores interrupted jobs
as paused. Electron `streamer://` playback, file verification, and deletion are
limited to its app-managed offline-media directory.

Primary Cast now creates and resolves a `PlaybackSession` through
`PlaybackOrchestrator`. The cast dialog prepares a cast-ready source before
device selection when possible, records readiness and fallback through
`PlaybackSessionPlaybackService`, and keeps bridge-backed sessions active while
the remote display is playing. Manual advanced-source casts remain separate.

The intended migration sequence is:

1. Add the shared `PlaybackSession` contract.
2. Extend the planner with ordered, opaque candidates and decision rationale.
3. Add a client session store and typed event reducer.
4. Route Play Best through session-driven fallback and timeout behavior.
   **Complete.**
5. Route primary downloads through the same session model. **Complete.**
6. Add verified download queue state and Electron restart recovery.
   **Complete.**
7. Route cast through the same session model. **Complete.**

Current status: steps 1 through 7 are complete. Gateway progress now has
explicit `no_peers` and `stalled` states, and the torrent engine treats those
as terminal for the current candidate so Play Best can fall back instead of
polling forever. Remaining work is reliability and productization: remux
runtime/cache limits, real-device download/cast/gateway tests, release
evidence, and a more polished player readiness UI.

Current terminal playback errors include specific source causes such as
`NO_PEERS`, `BRIDGE_UNAVAILABLE`, `BRIDGE_UNSUPPORTED`, `UNSUPPORTED_CODEC`,
`PLAYBACK_TIMEOUT`, and a chain-level `NO_PLAYABLE_SOURCE` when multiple
planned candidates were attempted and none worked. Single-candidate failures
should preserve the specific cause; mixed multi-candidate failures should end
with `NO_PLAYABLE_SOURCE` so the player can stop buffering and show a clear
"no source worked" state.

XState is optional. Introduce it only if a typed reducer/service cannot keep
the shared lifecycle understandable and testable.

## Agent Guardrails

- Do not persist raw `Stream` objects, media URLs, magnets, info hashes,
  external URLs, bridge URLs, or subtitle URLs inside `PlaybackSession` events
  or snapshots.
- Do not bypass `PlaybackOrchestrator` and
  `PlaybackSessionPlaybackService` for primary Play, Download, or Cast flows.
- Do not make manual source picking the default UX again. `More Sources` is an
  advanced fallback.
- Do not mark downloads offline-playable unless a local file URI exists and has
  been verified.
- Do not add XState just because the workflow is stateful. Add it only when the
  reducer/service model has become harder to reason about than a formal state
  machine.
- Rehydrated sessions without runtime candidate mappings must re-plan; they
  must not attempt to reconstruct source data from persisted state.
