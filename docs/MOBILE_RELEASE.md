# Mobile Release Baseline

Streamer uses Expo Application Services (EAS) for native development,
internal preview, and store-oriented production builds. This baseline makes
the configuration reproducible; it does not prove App Store or Play Store
readiness. Real builds and device QA remain release evidence.

## Stable Application Identity

| Field                 | Value                  |
| --------------------- | ---------------------- |
| Display name          | `Streamer`             |
| Expo slug             | `streamer`             |
| URL scheme            | `streamer`             |
| iOS bundle identifier | `com.bbrowns.streamer` |
| Android package       | `com.bbrowns.streamer` |

Changing either native identifier after publishing creates a different store
application. Treat these values as permanent unless the product owner makes an
explicit migration decision.

## Build Profiles

| Profile       | Distribution        | EAS environment | Update channel | Purpose                               |
| ------------- | ------------------- | --------------- | -------------- | ------------------------------------- |
| `development` | Internal dev client | `development`   | `development`  | Local/native debugging                |
| `preview`     | Internal            | `preview`       | `preview`      | Tester and release-candidate builds   |
| `production`  | Store               | `production`    | `production`   | App Store / Play submission candidate |

All profiles use Node `24.18.0`. EAS owns native build numbers through
`cli.appVersionSource: remote`; preview and production builds auto-increment
their developer-facing build number. The update runtime follows the public app
version (`runtimeVersion.policy: appVersion`). Bump the app version for native
runtime changes and public releases.

`expo-updates` is disabled when no EAS project ID is configured. Preview and
production configuration fails before build when the project ID is missing,
rather than producing an app pointed at an invalid update service.

## EAS Environment Variables

Configure these in the matching EAS environment. Values beginning with
`EXPO_PUBLIC_` are embedded in the client bundle and are never secrets.

| Variable                                | Development | Preview  | Production | Classification           |
| --------------------------------------- | ----------- | -------- | ---------- | ------------------------ |
| `EXPO_PUBLIC_API_URL`                   | Optional    | Required | Required   | Public HTTPS API origin  |
| `EAS_PROJECT_ID`                        | Optional    | Required | Required   | Public Expo project UUID |
| `EXPO_PUBLIC_SENTRY_DSN`                | Optional    | Optional | Required   | Public client DSN        |
| `SENTRY_ORG`                            | Optional    | Optional | Required   | Build configuration      |
| `SENTRY_PROJECT`                        | Optional    | Optional | Required   | Build configuration      |
| `EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Optional    | Optional | Optional   | Public telemetry setting |
| `EXPO_PUBLIC_SENTRY_ERROR_SAMPLE_RATE`  | Optional    | Optional | Optional   | Public telemetry setting |

Release automation may also inject
`EXPO_PUBLIC_STREAMER_GIT_SHA`,
`EXPO_PUBLIC_STREAMER_BUILD_DATE`, and
`EXPO_PUBLIC_STREAMER_BUILD_CHANNEL`. The dynamic app configuration validates
HTTPS release API URLs, rejects placeholders, and prevents URL passwords from
being embedded.

## Secrets And Credentials

Never commit or prefix these with `EXPO_PUBLIC_`:

- `SENTRY_AUTH_TOKEN` for source-map upload.
- `EXPO_TOKEN` for non-interactive EAS CLI access.
- Apple distribution certificates, provisioning credentials, App Store
  Connect API keys, issuer IDs, and key IDs.
- Google Play service-account JSON and Android upload/signing keys.

Prefer EAS-managed credentials and repository/EAS secret storage. The Sentry
organization and project names may be stored as build configuration; the
Sentry auth token must remain secret.

## Initial Project Setup

The repository deliberately does not contain a real Expo project ID or store
credentials. A maintainer with the correct accounts completes this once:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init
```

Record the resulting project UUID as `EAS_PROJECT_ID` in the preview and
production EAS environments, then configure the API and Sentry values above.
Do not replace the stable application identifiers during initialization.

## Validation And Builds

Credential-free configuration validation runs in CI and can be run locally:

```bash
npm run mobile:config:check
```

Once account variables and credentials exist, start internal builds from
`apps/mobile`:

```bash
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile preview --platform android
```

Production builds use `--profile production`. A successful remote build is
not sufficient release evidence by itself: record install, launch, API,
playback, download, cast, update, and crash-reporting results in
[QA_MATRIX.md](./QA_MATRIX.md) and [RC_CHECKLIST.md](./RC_CHECKLIST.md).
