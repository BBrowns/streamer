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
