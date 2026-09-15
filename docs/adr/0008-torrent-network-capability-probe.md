# ADR-0008: Diagnose Torrent Network Capability Before Playback

- Status: Accepted
- Date: 2026-09-15
- Owner: Streamer playback platform
- Supersedes: none
- Superseded by: none

## Context

The app can observe Wi-Fi, ethernet, VPN, browser online state, and similar
signals, but those signals do not prove that the bridge can discover peers,
exchange BitTorrent wire traffic, receive metadata, or read torrent bytes. A
failed media source is also not sufficient evidence that the user's network is
blocked.

## Decision

The authenticated Bridge v1 service may advertise an optional
`diagnostics.torrentNetworkProbe` capability. When configured, the bridge runs
one bounded, server-owned synthetic torrent probe through the same execution
target used for playback. The probe has a maximum duration of 15 seconds,
shares concurrent callers, caches results briefly per bridge runtime, and
cleans up all torrent resources. The response is limited to an opaque probe id,
safe phase/status values, elapsed time, peer count, and a typed failure code.

The client owns a runtime-only snapshot through `bridgeReadinessRuntime`.
`unknown` is non-blocking; one failure is `degraded`; two matching failures in
the same bridge runtime can become `blocked`. A blocked result may skip torrent
candidates only when another playback route is available. Direct, HLS, debrid,
and other route types are not blocked by a torrent probe result.

The app may show a network type or online-state hint, but it never treats that
hint as authoritative. No SSID, IP address, peer address, tracker URL, magnet,
hash, media URL, or credential is returned or logged. No firewall, NAT, VPN, or
private-network workaround is introduced.

The capability and endpoint are additive. Old bridges omit the capability and
the client treats that as `unknown`; no persisted playback fields or Electron
IPC channels are added.

## Consequences

- Users get an actionable distinction between bridge failure, transport
  restriction, and a source-specific torrent failure.
- A probe consumes bounded bridge resources and can itself be unavailable;
  `unknown` must therefore remain a normal compatibility state.
- Results are per execution target, so a local desktop bridge and a remote
  bridge are not conflated.
- QA must record home and work/guest-network observations separately and must
  not claim that one source failure proves a network restriction.

## Validation And Rollback

Unit and contract tests cover schema compatibility, authentication,
single-flight, timeout, cancellation, cleanup, safe logging, and old-bridge
fallback. Reproducible QA runs should record only safe categories under
`docs/qa-runs/YYYY-MM-DD/network-capability.md`. Removing the optional
capability or omitting its server configuration rolls the feature back to
`unknown` without a data migration; ordinary playback remains available.
