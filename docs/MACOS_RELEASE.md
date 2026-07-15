# macOS Release

Streamer has two desktop package paths:

- `npm run package:mac --workspace=@streamer/desktop` creates the unsigned
  package directory used by CI smoke checks.
- `npm run package:mac:release --workspace=@streamer/desktop` creates signed
  macOS release artifacts from `apps/desktop/electron-builder.release.json`.

The release path produces DMG and ZIP artifacts for `arm64` and `x64`, enables
hardened runtime, applies Electron entitlements, and runs the notarization hook
when notarization is explicitly enabled.

## Required Apple Secrets

Signing is handled by electron-builder. CI or a local release shell must provide
the Developer ID Application certificate through one of the standard
electron-builder signing mechanisms, for example:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `CSC_NAME` when multiple signing identities are available

The GitHub release workflow maps repository secrets into these variables:

- `MACOS_CSC_LINK` -> `CSC_LINK`
- `MACOS_CSC_KEY_PASSWORD` -> `CSC_KEY_PASSWORD`
- `MACOS_CSC_NAME` -> `CSC_NAME`

Notarization is opt-in. Set `STREAMER_NOTARIZE=true` and provide one of these
credential sets:

- App Store Connect API key:
  - `APPLE_API_KEY`
  - `APPLE_API_KEY_ID`
  - `APPLE_API_ISSUER`
- Apple ID app-specific password:
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`

Do not set `STREAMER_NOTARIZE=true` for pull-request builds or unsigned local
smoke packages.

## Local Release Dry Run

Validate the config without signing:

```bash
npm run release:check --workspace=@streamer/desktop
```

Build the existing unsigned smoke package:

```bash
npm run package:mac --workspace=@streamer/desktop
```

Build signed release artifacts after loading signing and notarization secrets:

```bash
STREAMER_APP_VERSION="$(node -p \"require('./package.json').version\")" \
STREAMER_GIT_SHA="$(git rev-parse HEAD)" \
STREAMER_BUILD_CHANNEL="production" \
STREAMER_NOTARIZE=true \
npm run package:mac:release --workspace=@streamer/desktop
```

`package:mac:release` deliberately fails before packaging when product version,
Git SHA, or channel is missing or set to `unknown`. Development and unsigned
smoke packages may remain unstamped and show `Not stamped (development)` in the
About screen.

## GitHub Release Workflow

Use **Desktop Release** (`.github/workflows/release-desktop.yml`) from GitHub
Actions when you want a reproducible macOS release artifact. The workflow is
manual-only (`workflow_dispatch`) and requires:

- `tag_name`: release tag or RC tag, for example `v0.1.0-rc.1`
- `build_channel`: `rc` or `production`
- `notarize`: whether to run Apple notarization after signing
- `draft_release`: whether to create/update a draft GitHub Release

The workflow injects build metadata, validates the release config, runs:

```bash
npm run package:mac:release --workspace=@streamer/desktop
```

Then it validates that DMG/ZIP artifacts exist, uploads
`streamer-desktop-macos-release`, writes a release-notes draft, and optionally
creates a draft GitHub Release with those artifacts attached.

## Artifact Validation

After building a signed app, inspect the `.app` before distribution:

```bash
codesign -dvvv --entitlements :- "apps/desktop/release/mac-arm64/Streamer.app"
spctl -a -vv "apps/desktop/release/mac-arm64/Streamer.app"
xcrun stapler validate "apps/desktop/release/Streamer-*.dmg"
```

Expected results:

- `codesign` shows a Developer ID Application authority for release builds.
- Entitlements include Electron hardened-runtime allowances.
- `spctl` accepts the app after notarization.
- `stapler` validates notarized DMG artifacts.

## Current Limits

The repository has a signing/notarization configuration path and validation
script plus a manual GitHub release workflow. Distribution still depends on
loaded Apple secrets and packaged-app QA evidence.

Windows packaging/signing is explicitly deferred. This path does not add silent
auto-update publishing or App Store distribution. Desktop updates currently
remain manual notices only; see [DESKTOP_UPDATES.md](./DESKTOP_UPDATES.md).
