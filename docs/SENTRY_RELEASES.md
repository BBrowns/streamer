# Sentry Releases And Privacy-Safe Breadcrumbs

Streamer uses Sentry only when a DSN is configured for the target runtime. It
must never be enabled by default in local development, tests, or unsigned
preview builds.

## Runtime DSNs

| Runtime       | DSN variable                                                |
| ------------- | ----------------------------------------------------------- |
| Mobile/web    | `EXPO_PUBLIC_SENTRY_DSN`                                    |
| Server        | `SENTRY_DSN`                                                |
| Stream bridge | `STREAMER_BRIDGE_SENTRY_DSN`, falling back to `SENTRY_DSN`  |
| Desktop main  | `STREAMER_DESKTOP_SENTRY_DSN`, falling back to `SENTRY_DSN` |

Development capture is opt-in only:

- Mobile/web: `EXPO_PUBLIC_SENTRY_ENABLE_DEV=true`
- Server: `SENTRY_ENABLE_DEV=true`
- Stream bridge: `STREAMER_BRIDGE_SENTRY_ENABLE_DEV=true`
- Desktop main: `STREAMER_DESKTOP_SENTRY_ENABLE_DEV=true`

## Release Metadata

Release names are derived from shared build metadata unless explicitly
overridden by runtime-specific Sentry release variables:

```text
streamer-<runtimeType>@<appVersion>[+<gitShaShort>]
```

Source-of-truth build variables:

- `STREAMER_APP_VERSION`
- `STREAMER_GIT_SHA`
- `STREAMER_BUILD_DATE`
- `STREAMER_BUILD_CHANNEL`
- `STREAMER_BUILD_ENVIRONMENT`

Expo public equivalents are documented in [BUILD_METADATA.md](./BUILD_METADATA.md).

## Source Map Upload

Dry-run locally:

```bash
npm run sentry:release:dry-run
```

Publish releases and source maps:

```bash
SENTRY_AUTH_TOKEN=... \
SENTRY_ORG=... \
SENTRY_PROJECT=... \
STREAMER_APP_VERSION=0.1.0 \
STREAMER_GIT_SHA=$(git rev-parse HEAD) \
STREAMER_BUILD_ENVIRONMENT=production \
npm run sentry:release
```

The script creates/finalizes one release per runtime and uploads source maps
only when `.map` files exist in known build output directories:

- `server/dist`
- `packages/stream-server/dist`
- `apps/desktop/dist`
- `apps/mobile/dist`

CI validates this workflow in dry-run mode on every build check. On pushes to
`master` or `main`, the same CI job runs the real upload step if Sentry secrets
are configured. Missing secrets cause a safe skip rather than a failed release
build.

`SENTRY_CLI_COMMAND` can override the CLI invocation. The default is:

```text
npx --yes @sentry/cli
```

## Breadcrumb Policy

Playback, gateway, download, and cast breadcrumbs are intentionally small and
privacy-safe. They may include:

- session and candidate IDs
- action, candidate kind, rank, and compatibility flags
- bridge/gateway phase, peer count, progress bucket, and retryability
- download verification status
- cast device type and content type
- typed error codes and fallback decisions

They must not include:

- raw media URLs
- signed gateway stream URLs
- magnets
- torrent info hashes unless hashed
- access tokens or bridge tokens
- local file paths or local file URIs
- user email, IP address, device name, or media title

Use `createStreamerBreadcrumb()` from `@streamer/shared` before calling
`Sentry.addBreadcrumb()` in any runtime. Runtime-specific Sentry
`beforeBreadcrumb` hooks are still kept as a second redaction layer.

## Failure Buckets

Release-candidate evidence tracks these top-level failure buckets so support,
QA, and Sentry triage use the same vocabulary:

- `no_peers`
- `timeout`
- `bridge_unavailable`
- `unsupported_codec`
- `remux_unavailable`
- `cast_unreachable`
- `download_verification_failed`
- `security_policy_blocked`

These buckets are intentionally coarse. Detailed session, planner, gateway,
download, or cast context belongs in privacy-safe breadcrumbs and debug bundles,
not in raw logs.

## Release Health

Mobile and Electron SDKs can report release/session health when their Sentry
SDK supports it and the runtime is configured with DSN, release, and
environment metadata. Node server and stream-server health is represented
through release-tagged errors, breadcrumbs, deploy metadata, and health
endpoints rather than user-session tracking.

## RC Evidence Bundle

CI generates `artifacts/rc-evidence/rc-evidence.md` through:

```bash
npm run rc:evidence
```

The artifact summarizes build metadata, required CI jobs, Sentry/source-map
status, failure buckets, QA links, known release blockers, and privacy checks.
It is evidence for go/no-go review, not an automatic release-ready claim.
