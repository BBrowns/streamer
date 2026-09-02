# Architecture Decision Records

These records capture the durable decisions behind Streamer's playback
architecture. They describe implemented direction; target-specific support is
claimed only where the repository has corresponding evidence.

- [ADR-0001: Retain the existing application stack](./0001-retain-existing-stack.md)
- [ADR-0002: Separate the control plane from the media plane](./0002-control-plane-media-plane.md)
- [ADR-0003: Put platform playback behind media-player adapters](./0003-media-player-adapters.md)
- [ADR-0004: Separate source preparation from media playback](./0004-source-preparation-adapters.md)
- [ADR-0005: Access the media bridge through a versioned contract](./0005-versioned-bridge-contract.md)
- [ADR-0006: Plan explicit execution targets and delivery modes](./0006-explicit-playback-routes.md)
- [ADR-0007: Keep authentication and sync failures separate](./0007-auth-sync-degraded-mode.md)

New records are additive. Superseded records stay in this directory with an
updated status and a link to their replacement.

Use [TEMPLATE.md](./TEMPLATE.md) for new durable decisions. Do not create an
ADR for a routine local implementation choice; record temporary task state in
the PR instead.
