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
- `sourceDiscovery` with only `partial`/`complete` status and a usable-candidate
  count

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
the remote display is playing. Manual advanced-source casts remain separate,
but the client still preflights cast URLs and rejects localhost-only playback
URLs before sending the bridge request because remote displays cannot reach the
app device loopback interface.

Before Play, Download, or Cast performs those effects, readiness is evaluated
through the shared `evaluateActionPreflight` contract. The contract consumes a
snapshot of platform, source kind, bridge URL scope, reachability, auth, and
gateway/torrent/remux/cast capabilities and returns a typed reason plus safe
user copy. It does not detect or start the bridge, resolve a source, or create a
gateway job. Direct and HLS playback intentionally remain available when only
the torrent runtime is broken.

`apps/mobile/services/actionRecovery.ts` maps those typed preflight/runtime
failures into one user-facing next action. Download tasks persist only a small
failure reason and can offer resume, fresh replan, file verification, storage
management, bridge repair, or removal. Offline readiness still requires a
verified managed local file.

Cast transport errors are similarly typed as discovery, device, source, or
bridge failures. The cast dialog exposes refresh, session-driven source
fallback, or bridge repair and shows when another planned candidate is being
attempted. It never retries a loopback-only source for a remote display. These
states are deterministic UX behavior, not evidence of native/background cast
support on untested devices.

## Fast Source Discovery And Immediate Launch

The server owns a memory-only, 30-second stream-discovery cache scoped to the
user, content type, and content ID. `/api/stream` and `/api/playback/plan`
share its in-flight provider fan-out, so a stream-card lookup, Detail prefetch,
and Play do not each ask every add-on again. Add-on installation, removal, and
manifest revalidation invalidate the relevant user scope. A client-side plan
memo is also runtime-only and is cleared when the account, bridge setup, or
add-on set changes.

All compatible providers start in parallel. The first usable response starts a
250 ms batch window; 1.75 seconds is the fast boundary for returning a usable
partial result. The remaining providers continue only long enough to fill the
same short-lived server cache. A late usable result is released immediately
once it arrives, rather than being held until every provider has settled.
`sourceDiscovery.status` tells the client whether the plan is partial or
complete, and `usableCandidateCount` tells it how many planner-eligible
candidates are presently available. The status fields carry no raw source,
provider, manifest, URL, magnet, or hash data.

Detail begins a non-blocking plan prefetch after 600 ms of idle time and on
desktop Play hover/focus. Bridge detection starts once in parallel with that
plan and is shared by concurrent callers. When Play is pressed, Detail creates
a runtime-only, abortable launch intent and immediately opens the player. The
player displays a planning state, takes ownership of the normal session
resolver as soon as a plan arrives, and must not show synthetic loading
percentages.

Escape, Close, and Cancel abort the foreground plan or partial-plan recovery,
clean up a provisional session/engine, and ignore late results. If all
candidates from a partial plan fail, the player makes one bounded automatic
replan while late providers can finish. It changes sessions only if that work
produces a new candidate; it does not restart an identical partial plan in a
loop. Torrent attempts remain serial — the singleton torrent engine must not
be used to race multiple torrent preparations.

Ranking is intentionally start-first. The planner rejects qualities outside the
user's explicit allowlist before it ranks candidates. For the remaining
compatible candidates it favours direct/HLS transport, compatible codecs and
containers, and realistic torrent seeder health before resolution. A healthy
1080p source can therefore outrank a weak 2160p torrent. Exact ranking reasons
remain an advanced diagnostic concern, not primary playback copy.

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

Current status: steps 1 through 7 are complete. Gateway readiness has explicit
`no_peers` and `stalled` states, and the torrent engine treats those as terminal
for the current candidate so Play Best can fall back instead of polling forever.
Peer discovery has a 12-second limit for an otherwise unconnected source. Once
the first peer connects, it gets up to 20 seconds to provide metadata, with a
32-second hard cap for the full discovery-and-metadata phase. The selected
torrent file—not an add-on label—then decides whether the gateway can bridge it
directly or needs an MP4 remux.

For the primary Play action, the playback control plane passes a runtime-only
`progressive-fmp4` delivery choice for a remuxed torrent. Gateway readiness then
only requires a verified first torrent byte (up to 20 seconds); when the player
opens the signed URL, FFmpeg emits a chunked fragmented MP4 with an empty movie
header and subsequent media fragments. That live response intentionally has no
arbitrary byte-range or seek support, and its `media` metadata reports
`seekable: false` with `cacheStatus: "streaming"`. The live FFmpeg pipeline is
cancelled with the gateway job when Play is cancelled or closed.

Downloads, Cast, and the compatibility/manual seekable route retain
`seekable-cache`: FFmpeg materializes a `+faststart` MP4 before it is declared
ready, with a bounded 60-second remux window and normal `HEAD`/byte-range
semantics. This costs more startup time but is required for stable seeking and
consumers that need a complete file. Fragmented MP4 is a container transmux, not
a video transcode: an unsupported copied codec such as HEVC or AV1 still relies
on the existing candidate fallback rather than being made playable by remuxing.

A `no_peers` result belongs to that candidate rather than the bridge as a whole,
so the next eligible torrent source is still attempted. Gateway preparation
does not report an elapsed-time percentage; the player presents phase and peer
state until actual media metrics are available. The legacy `/stream` compatibility
endpoint follows the same peer/metadata limits, keeps its seekable-cache default,
and aborts its readiness wait when the caller disconnects. If the session-wide
envelope expires, the terminal result is a retryable timeout rather than a
misleading `NO_PLAYABLE_SOURCE` for candidates it never had time to try. The
client uses the gateway's relative elapsed duration when it adopts an upgraded
readiness budget, so a desktop bridge and a mobile/web renderer do not need
synchronized wall clocks. Unknown-container torrent labels reserve the bounded
remux allowance until metadata makes the container decision authoritative.
Remaining work is reliability and productization: real-device
download/cast/gateway tests, release evidence, and a more polished player
readiness UI.

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
- Do not persist discovery or planner caches, or add raw source fields to their
  timing logs. Only the aggregate safe `sourceDiscovery` status/count may cross
  the runtime-plan boundary.
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
- Do not parallelize torrent warm-up without a separate coordinator with clear
  job ownership and cancellation semantics.
