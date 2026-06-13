# Add-on Trust Model

Streamer treats all user-installed add-ons as untrusted network sources.
Add-ons can provide useful catalogs, metadata, subtitles, and streams, but the
server must not let an add-on URL become a server-side request forgery path or
an unbounded payload source.

## Trust Levels

### Public Add-ons

Default production behavior:

- Add-on transport URLs must use `https://`.
- URL credentials are rejected.
- Redirect targets are validated before every hop.
- Private, loopback, link-local, multicast, documentation, benchmarking,
  carrier-grade NAT, and metadata-service IP ranges are blocked.
- Localhost names, `.localhost` names, and metadata hostnames are blocked.
- Unsupported protocols such as `ftp:`, `file:`, `data:`, and `javascript:` are
  blocked.

### Private-Network Development Add-ons

`ADDON_ALLOW_PRIVATE_NETWORKS=true` intentionally allows local/private targets
for development and self-hosted testing.

This does not make public HTTP add-ons trusted. With the private-network opt-in,
plain `http://` is only accepted when the target resolves to a private/local
network address. Public add-ons still need HTTPS.

Do not enable this setting for production deployments.

## Request Policy

All add-on manifest and resource fetches use the shared source policy:

- Manual redirect handling with a maximum of 3 redirects.
- Every redirect target is validated before it is requested.
- Default timeout follows `ADDON_TIMEOUT_MS`.
- Manifest payloads are capped at 256 KiB.
- Catalog/meta/stream resource payloads are capped at 1 MiB.
- Responses are validated with the expected Zod schema before being used.
- Logs use protocol/hostname/path summaries rather than raw source URLs.

## Current Scope

Covered by policy:

- Add-on installation and manifest revalidation.
- Aggregate catalog fetches.
- Exact add-on catalog fetches.
- Metadata fetches.
- Stream fetches.
- Search fetches.

Out of scope:

- Direct media URLs returned by add-ons are still candidate data. They are
  sanitized and evaluated by playback planning/download/cast rules, but they are
  not fetched by the API server during catalog aggregation.
- Native bridge gateway media streaming has its own bridge/cast URL policy.

## Bridge Trust Boundary

Bridge control and gateway routes require `STREAMER_BRIDGE_TOKEN` whenever the
token is configured. In production, those routes fail closed if the token is
missing instead of falling back to the permissive local-development mode.

Local development can still run without a token so the desktop app and stream
server remain easy to start from source. Production builds must create or pass a
pairing token before exposing bridge control, gateway job, torrent metric, or
cast routes.

## User-Facing Behavior

Unsafe add-on URLs fail installation with
`ADDON_SOURCE_BLOCKED` and a generic source-safety message. This is intentional:
the UI should explain that the add-on is blocked by safety policy without
revealing internal network details or metadata-service addresses.
