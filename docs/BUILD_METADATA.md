# Build Metadata

Streamer exposes a shared build metadata shape across the API server, desktop
main process, desktop renderer/mobile client, and stream-server bridge.

## Fields

Every runtime reports:

- `appVersion`
- `gitSha`
- `gitShaShort`
- `buildDate`
- `buildChannel`
- `runtimeType`
- `environment`
- `release`

`runtimeType` is one of:

- `mobile`
- `desktop-main`
- `desktop-renderer`
- `server`
- `stream-server`

`environment` is normalized to `development`, `preview`, `production`, or
`test`.

## Environment Source Of Truth

Release pipelines should inject these variables:

| Variable                     | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `STREAMER_APP_VERSION`       | Product/app version for the built runtime. |
| `STREAMER_GIT_SHA`           | Full commit SHA.                           |
| `STREAMER_BUILD_DATE`        | ISO build timestamp.                       |
| `STREAMER_BUILD_CHANNEL`     | Build channel, for example `dev` or `rc`.  |
| `STREAMER_BUILD_ENVIRONMENT` | Runtime environment classification.        |

Expo public builds can use matching public variables:

| Variable                                 |
| ---------------------------------------- |
| `EXPO_PUBLIC_STREAMER_APP_VERSION`       |
| `EXPO_PUBLIC_STREAMER_GIT_SHA`           |
| `EXPO_PUBLIC_STREAMER_BUILD_DATE`        |
| `EXPO_PUBLIC_STREAMER_BUILD_CHANNEL`     |
| `EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT` |

Fallbacks exist for common CI variables such as `GITHUB_SHA`,
`VERCEL_GIT_COMMIT_SHA`, `EAS_BUILD_GIT_COMMIT_HASH`, `SOURCE_DATE_EPOCH`, and
`npm_package_version`. Missing build-time values are reported as `unknown`
rather than invented at runtime.

## Exposure

- API server: `/health` includes `build`.
- Stream-server bridge: `/api/health` and `/status` include `build`.
- Desktop main: `window.desktopBridge.getBridgeInfo()` includes desktop build
  metadata and bridge health includes stream-server metadata.
- Mobile/desktop renderer: Sources & Devices displays client, desktop, and
  bridge build labels when available.
- Sentry: release names and tags are derived from the same metadata.
- Server logs: pino base fields include version, runtime, channel, and short
  SHA.

## Release Names

Default release names use:

```text
streamer-<runtimeType>@<appVersion>[+<gitShaShort>]
```

Examples:

- `streamer-server@0.1.0+1234567890ab`
- `streamer-stream-server@0.1.0+1234567890ab`
- `streamer-desktop-main@0.1.0+1234567890ab`
- `streamer-desktop-renderer@1.0.0+1234567890ab`
- `streamer-mobile@1.0.0+1234567890ab`
