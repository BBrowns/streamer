# Network capability probe — 2026-09-15

## Run 1: work guest network

- Network context: work/guest network, reported by the user; no SSID, address, or other network identifier recorded.
- Target: local development Electron bridge on the selected desktop execution target.
- Bridge capability: `torrentNetworkProbe: true` after rebuilding and restarting the sidecar with the server-owned diagnostic fixture.
- Probe result: `degraded`.
- UI result: `Torrent playback test — degraded`; playback was not globally blocked.
- Probe correlation: `7052d43a-3e96-4e1c-beda-9773f6ed36f2`.

Safe phase breadcrumbs:

| Phase        | Result      |  Elapsed | Detail                               |
| ------------ | ----------- | -------: | ------------------------------------ |
| `bridge`     | passed      |     1 ms | Authenticated bridge reachable       |
| `peer`       | observed    |   551 ms | Initial peer sample was 0            |
| `wire`       | observed    | 1,165 ms | Wire event received                  |
| `metadata`   | degraded    | 8,169 ms | `METADATA_UNAVAILABLE`, peer count 1 |
| `first_byte` | not reached |        — | Metadata was not available           |
| `cleanup`    | complete    | 9,179 ms | Probe torrent/listeners cleaned up   |

Interpretation: this run does not prove that the whole guest network blocks torrent traffic. It shows that the bridge and wire path responded, while the controlled torrent did not provide metadata within the bounded probe window. This is consistent with a degraded torrent route or a source-specific metadata problem. A home-network run with the same fixture is required for comparison.

No playback attempt, media source, magnet, hash, URL, peer address, filename, credential, or raw runtime output was stored in this record.

## Run 2: current development sidecar on the work/guest network

- API health and bridge health both returned successfully.
- The bridge reported `ready` and advertised the normal playback deliveries,
  but it did not advertise `torrentNetworkProbe`.
- Sources & Devices therefore displayed the safe `unknown` state and did not
  claim that the network was blocked.
- The running sidecar was verified without the optional
  `STREAMER_TORRENT_NETWORK_PROBE_MAGNET` configuration. No probe was run in
  this run, so it cannot produce a passed/degraded/blocked network verdict.

### Playback comparison

The following playback attempts all used torrent candidates with HLS delivery:

| Title                     | Result                       | Safe evidence                                                                                                                                                           |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Shawshank Redemption  | Fail                         | Five bounded candidates; peers were intermittently visible, but every job ended in `SOURCE_STALLED` before metadata, container selection, first byte, or player attach. |
| Clue                      | Fail                         | Five bounded candidates; no metadata-to-player lifecycle completed.                                                                                                     |
| The Gentlemen — episode 1 | Cancelled during preparation | Peers were observed, but the run remained in peer/metadata preparation and was cancelled before player attach.                                                          |

`The Shawshank Redemption` is a useful control because it reached playback in
the earlier home-network run. The current failure is therefore consistent
with the previously observed work/guest-network degradation, but it is not a
formal network verdict: the controlled probe was unavailable and all tested
sources were torrent sources.

### Follow-up

Restart the desktop sidecar with the server-owned synthetic probe fixture
configured, then run the same probe and one control title on the home network.
Keep the existing bounded candidate limit and timeouts unchanged. Do not use a
user media source as the diagnostic fixture and do not record its identifying
data.

## Run 3: home network control playback

- Network context: home network, reported by the user; no SSID, address, or other network identifier recorded.
- API, bridge, and desktop sidecar became ready after Docker Desktop was started. The first development start hit the bounded web-renderer startup deadline; a cache-warmed restart succeeded.
- The optional torrent network probe was not advertised by this sidecar, so the UI remained `unknown`; this run does not claim a formal probe verdict.
- Control: The Shawshank Redemption (film; torrent/HLS playback path).
- Attempt 1 ended in `SOURCE_STALLED` before metadata. The bounded fallback started one subsequent candidate.
- Attempt 2 reached metadata, runtime container selection, HLS manifest, first fragment, video metadata, `can play`, and `playing`.
- The player displayed `1080p · Torrent · Remux · EN · 5.1(side) · AC3`. The HLS seek window grew while playback continued.
- Scrubbing within the published window worked through the existing `Seek back 10 seconds` control; playback continued afterwards.
- Outcome: pass on the home network.
- A nonfatal HLS buffer stall was observed while the window was still growing and playback recovered. The playback console contained no errors or warnings during the completed run.

Interpretation: together with Run 2, this strongly supports a network-dependent
torrent metadata difference between the work/guest and home networks. It is
not proof that every torrent source is blocked on the work network: a
server-owned synthetic probe is still required for that classification, and
the current sidecar did not advertise it.

## Source matrix on the same network

### Series: The Gentlemen — episode 1

- Flow: Play Best.
- Source class observed in the bridge jobs: torrent with HLS/remux preparation.
- Automatic fallback: 5 unique candidates; no duplicate candidate attempt observed.
- Outcome: no player attach or first byte. Candidates ended in bounded peer or metadata timeouts.
- UI outcome: `No playable source` with Retry, Choose another source, and More options.

### Film: Clue (1985)

- Flow: Play Best.
- Source class observed in the bridge jobs: torrent with HLS/remux preparation.
- Automatic fallback: 5 unique candidates.
- Outcome: one candidate reached metadata and runtime container selection (`mkv`), then failed during audio probing with `INTERNAL`; the other candidates ended in peer or metadata timeouts. No player attach or first byte occurred.
- UI outcome: `No playable source`.
- Manual English-labelled candidate: separately selected from More Sources; it ended in the bounded `selected torrent sources found peers, but their metadata was not ready in time` state.
- Source inspector: all available ranked sources for this title were torrent sources. No direct, HLS-origin, or debrid source was available to test in this environment.

Coverage conclusion: this run covers one series, one film, automatic fallback, one manually selected English-labelled torrent, MKV runtime detection, peer timeout, metadata timeout, and an audio-probe failure. It does not yet cover a successful direct/HLS/debrid playback path; that requires a title with such a source or a configured provider, and should be repeated on the home network for comparison.

## Follow-up: non-network playback fix

The audio-probe failure was reproduced as a gateway ordering bug, not as a
network verdict. The gateway attempted FFprobe immediately after torrent
metadata arrived, before the selected file's first readable bytes were
available. That produced `audio_probe_failed` for a candidate that could later
be remuxed successfully.

The fix now performs one first-byte preflight before FFprobe, reuses the
result for the selected remux path, and reuses the first audio catalog instead
of probing the same job twice. The change is covered by the gateway regression
test and the full stream-server gateway suite.

Post-fix local desktop validation reached:

`metadata → container selected (mkv) → first byte → English audio selected →
first fMP4 fragment → HLS manifest → ready → player attach`

The player displayed `EN · stereo · EAC3` and playback controls were present.
This confirms the non-network ordering bug is fixed for this run. Peer
discovery and metadata availability remain network/source dependent and are
recorded separately above.

## Run 4: home network follow-up after download-queue fix

- Network context: home network, reported by the user; no SSID, address, or other network identifier recorded.
- Target: development Electron bridge with the browser client on the same desktop.
- Torrent network probe: `unknown`; this sidecar still does not advertise the optional probe capability.
- Download flow: starting a planner-owned download immediately created one visible `Preparing` queue item. Navigating to Downloads while source resolution was still running kept that item in `Preparing`; it was not incorrectly converted to `Paused` merely because no desktop transfer job existed yet.
- Bounded source failure remained visible as a recoverable queue item under `Needs attention`, with the existing setup/retry guidance instead of an empty queue.
- Playback control: the same film first produced one bounded `SOURCE_STALLED` candidate, then a following HLS candidate reached metadata, manifest, first fragment, `can play`, and `playing`.
- Player state: `1080p · Torrent · Remux · EN · 5.1(side) · AC3`; the audio dialog exposed English and French tracks and retained English as the active selection.
- Safe controls verified: playback settings, audio-track selection, seek controls, Cast dialog/Close/Refresh, More Sources/Close, trailer opening in a separate tab, reversible Library add/remove, Downloads Select/Cancel, Smart Downloads navigation, and Sources & Devices Check again.
- Browser console: no errors; the only warning was the documented web `useNativeDriver` fallback.

Outcome: the home-network playback path and the download-queue visibility/reconciliation fix both passed in this run. This is strong evidence for the tested desktop/browser path, but not a blanket guarantee for every source or native target. Direct/HLS-origin/debrid sources and real device casting still require a matching fixture or target.
