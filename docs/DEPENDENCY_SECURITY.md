# Dependency Security Baseline

Streamer pins its development toolchain to **Node.js 26.7.0** and
**npm 12.0.2**. Use the repository `.nvmrc` before installing dependencies:

```bash
nvm install
nvm use
npm install --global npm@12.0.2
npm run ci:install
```

The root `dev:stream-server` launcher also checks CPU architecture before
starting the P2P daemon. This matters on Apple Silicon when `/usr/local/bin/node`
runs under Rosetta while native dependencies were installed as arm64. Use
`npm run dev:repair-native` to rebuild `esbuild` and `node-datachannel` with the
host's supported Node 26 runtime; do not copy `node_modules` between CPU
architectures.

Server development, typecheck, build, and test commands generate Prisma Client
before execution. This keeps a clean checkout reproducible without relying on a
previous `node_modules/.prisma` directory.

Node 26 is deliberately pinned for this upgrade. Installing native
dependencies with a different Node/Electron architecture can leave the desktop
bridge unable to load `node-datachannel`.

## CI Policy

Pull requests block on:

```bash
npm run ci:install
npm run security:install-scripts
npm run security:audit
```

CI also:

- installs with lifecycle scripts disabled, then runs only the version-pinned
  `patch-package` postinstall step and the explicitly approved
  `node-datachannel` native rebuild after the install-script policy passes;
- validates every GitHub Actions workflow with `actionlint@v1.7.12`;
- requires external GitHub Actions to use reviewed full commit SHAs;
- reviews the dependency delta on pull requests and blocks newly introduced
  high or critical advisories;
- runs dependency compatibility contract tests alongside the production audit;
- checks npm and GitHub Actions dependency drift through grouped weekly
  Dependabot updates;
- queues only safe Dependabot patch/minor PRs for protected auto-merge. Expo,
  React Native, Electron, Prisma, TypeScript, Sentry, Hono, NativeWind,
  Tailwind, native, and major updates stay manual and require a code-owner
  review;
- applies Prisma migrations in CI instead of mutating the schema with
  `db push`;
- enforces finite timeouts on every CI and release job;
- runs GitHub CodeQL default setup for Actions and JavaScript/TypeScript.

The weekly Maintenance Radar runs the read-only collector and stores a bounded
Markdown/JSON report as a workflow artifact. It does not open issues, change
repository settings, or approve dependency updates. Use the report to create a
focused maintenance task with an owner and removal condition.

Dependabot security updates are grouped only for compatible patch/minor paths.
Framework, native, and major upgrades remain separately reviewable so a
security PR cannot silently become an Electron, Expo, React Native, Prisma, or
Vite migration.

Repository secret scanning and push protection must remain enabled in GitHub.
Push protection is the preventive secret gate; do not replace it with an ad hoc
regular-expression scan. If these server-side controls are unavailable or
disabled, restore an equivalent reviewed scanner before removing this policy.

`CODEOWNERS` keeps the dependency manifests, release workflows, migration
directory, and security tooling assigned to the repository owner. The master
ruleset requires at least one approving review; automatic Dependabot merges can
only enter the merge queue after the required CI and dependency-review checks
are green.

`security:audit` rejects **high and critical production dependency findings**.
It runs npm's production audit and permits only exact, unexpired advisory
exceptions recorded in `scripts/security-audit.mjs` and the table below.
Development-only findings are reviewed separately because an automatic major
upgrade can be more dangerous than the finding it attempts to remove. Do not
describe the full dependency tree as vulnerability-free while reviewed
exceptions remain.

## Install Scripts

Dependency lifecycle scripts are an explicit trust boundary. The root
`allowScripts` map records every package in `package-lock.json` that has an
install script:

- approved entries are pinned as `package@exact-version: true`;
- denied optional scripts use `package: false`;
- an unreviewed script or an unpinned approval fails CI.

When a dependency version changes, review what its install script executes,
update the policy intentionally, and rerun the install-script check. Never add
a broad name-only approval to make CI pass.

The script-disabled install intentionally leaves native artifacts absent until
the final targeted rebuild. This keeps arbitrary dependency lifecycle code out
of CI while still producing the checked-in desktop bridge binary. If the
`node-datachannel` version changes, update the exact allow-list entry and the
rebuild contract in the same reviewed dependency change.

Vitest and `@vitest/*` version updates are grouped, including majors, because
coverage providers require the exact Vitest peer version. These updates remain
manual. The root Compose manifest uses the `docker-compose` updater; the server
Dockerfile keeps the `docker` updater.

The obsolete `GHSA-MH99-V99M-4GVG` brace-expansion exception was removed on
2026-09-07 after `test-exclude` resolved the compatible 1.1.18 release. The
October 2026 lockfile remediation below advances all compatible brace-expansion
lines beyond their current patched versions.

The root override keeps `js-yaml@4.3.2` for Hono consumers. Nodemailer is
pinned to `10.1.1` in the root workspace and root override, while the server
workspace declares `^10.0.10`. Nodemailer 10 requires Node.js 20 or newer and
ships its own TypeScript declarations; the server imports its named
`Transporter` type from that package, so `@types/nodemailer` is removed. The
repository runtime is Node.js 26.7.0. Revisit the override when every consumer
declares a compatible range and keep the production audit as the gate.

## September 2026 Maintenance Remediation

Nodemailer 10 changes are recorded in the [official changelog](https://github.com/nodemailer/nodemailer/blob/master/CHANGELOG.md) and [README](https://github.com/nodemailer/nodemailer).

The 2026-09-08 full and production dependency audits reported no advisories at
that time. Current production findings and any temporary exceptions are tracked
below.

Vitest and its V8 coverage provider now use the same exact 5.0.5 version in
all three test workspaces. Vite stays on the supported 7.x override and Node
stays on 26.7.0. The dependency compatibility test rejects divergent workspace
or coverage peer versions. Review future upgrades as one toolchain change.

The framework update keeps Expo SDK 57 and React Native 0.86.3, updates
Electron to 44.4.2 and Sentry React Native to 8.27.0, and refreshes compatible
Expo, Hono, Sentry and TypeScript ESLint patches. Sentry CLI advances from
3.7.0 to 3.8.0, and the exact install-script approval follows that version.
Its `postinstall` command and installer file are unchanged; platform payloads
remain integrity-pinned in the lockfile. The separate 2.58.6 approval remains
for Sentry's bundler plugins. Sentry Electron 7.19.0's integration logging
defaults are kept; this app did not enable those logs. Review this exact
approval at the next Sentry CLI upgrade.

Two parser updates require temporary consumer patches rather than a blind
major override:

- The previous `query-string` compatibility patch and nested override were
  removed during the SDK58 upgrade because the resolved Expo Router dependency
  graph no longer installs that package. If a future SDK reintroduces it, add a
  consumer-level parsing regression before restoring a patch or override.
- `stream-json@3.6.0` replaces the vulnerable 1.x dependency used only by
  Detox and Bunyamin. Their pinned patches select the new JSONL/array entry
  points and explicit Node stream adapters. Bunyamin's CommonJS, ESM and
  TypeScript entry points stay aligned. Node 26 supports the synchronous ESM
  import used by Detox. Owner: test infrastructure maintainers. Remove these
  parser patches and the override when Detox/Bunyamin adopt stream-json 3.6+
  upstream. The compatibility tests cover chunked records, malformed JSONL,
  stream completion and trace merging in both module formats.

The Expo Updates Android dev-client patch is retargeted to `58.0.17`, and the
Expo Video Android/iOS patch is retargeted to `58.0.11` after applying each
patch against the SDK58 package source. Remove either patch once an upstream
update preserves the tested startup and playback behavior without it. Owner:
mobile platform maintainers. Review these patches before the next release
candidate.

## October 2026 CI Remediation

The lockfile resolves `brace-expansion` to 1.1.21, 2.1.7, and 5.0.12, which
include the published fixes for [GHSA-6J4F-FJ2G-MC7P](https://github.com/advisories/GHSA-6J4F-FJ2G-MC7P)
and [GHSA-QHR7-859C-M2P7](https://github.com/advisories/GHSA-QHR7-859C-M2P7).
The root override applies only to `brace-expansion` under Minimatch 10, keeping
the other Minimatch major lines on their compatible patched releases. Owner:
repository dependency maintainers. Remove this override after Minimatch 10
raises its own minimum to a patched brace-expansion release and a clean lockfile
resolves that minimum without the override.

The current production audit also reports two packages for which the GitHub
Advisory Database lists no patched version: `braces@3.0.3` at
`node_modules/braces` ([GHSA-VFJ7-8CJW-P6XM](https://github.com/advisories/GHSA-VFJ7-8CJW-P6XM))
and `node-forge@1.4.0` at `node_modules/node-forge`
([GHSA-86W9-CPQP-85RV](https://github.com/advisories/GHSA-86W9-CPQP-85RV)). The
audit permits only those exact package paths until 2026-11-19. Owner: mobile
platform maintainers. Re-check upstream status by that date, upgrade to a fixed
release as soon as one is available, and remove the matching exception. If
either package still has no compatible fix on the expiry date, the production
audit blocks until the exception receives a fresh review.

Sources: [Vitest 5 migration](https://vitest.dev/guide/migration),
[Sentry CLI 3.8 update](https://github.com/getsentry/sentry-cli/compare/3.7.0...3.8.0),
[URI decoder release](https://github.com/SamVerschueren/decode-uri-component/releases/tag/v0.5.0),
[stream-json source](https://github.com/uhop/stream-json).

## Compatibility Overrides

Detox `20.51.4` still calls the callback-style `glob` export, while the
workspace keeps `glob@13` for the patched transitive toolchain. The scoped
`patches/detox+20.51.4.patch` adapts Detox's artifact globber to the Promise API
without downgrading the shared `glob` override. The dependency compatibility
test verifies that Detox loads; remove the patch when Detox publishes support
for the current glob API (or when the workspace no longer needs the glob
override). Owner: mobile/platform maintainers.

`castv2-client@1.2.0` is the current published release but depends on the old
`castv2` package, which declares `protobufjs@^6.8.8`. The repository forces
`protobufjs@7.6.5` to remove known parser vulnerabilities. A stream-server smoke
test verifies that the cast client still imports and constructs under this
override, and `patch-package` records the tested Protobuf 7 compatibility range
so the installed dependency tree remains valid. Replace the legacy cast
dependency when a maintained compatible client is selected; do not downgrade
`protobufjs` to satisfy the stale range.

The `ws` overrides preserve the major line expected by each consumer while
raising each line to a patched release. Avoid a global `ws` major override,
which would make Expo/React Native tooling invalid.

The Expo config-plugin chain still depends on `xcode@3.0.1`, whose UUID helper
range is stuck on the vulnerable `uuid@7` line. The root development dependency
now tracks `uuid@14.0.2`, while a scoped `xcode` override keeps
`uuid@11.1.1` next to xcode because that release still exposes the CommonJS
`uuid.v4()` call that xcode uses. The server workspace continues to use its
direct UUID 14 runtime. `npm run dependency:compatibility:test` exercises that
exact topology. Remove the scoped override when the Expo toolchain ships an
`xcode` release with a compatible UUID API, and retain the lockfile/API smoke
check when doing so.

The mobile color extraction package follows `node-vibrant`'s browser entry in
the supported web path, so the unused Node/Jimp adapter is replaced with the
equivalent `@vibrant/image-browser@4.0.4` package through the scoped
`node-vibrant` override. This removes the legacy `file-type` parser branch from
the lockfile while preserving the browser API. Remove the override when
`react-native-image-colors` or `node-vibrant` no longer installs the unused
Node adapter; the dependency compatibility test must continue to prove that
no `file-type` node is present. Owner: mobile/platform maintainers.

`bittorrent-tracker@11.2.3` keeps its local UDP parser patch, while its `ip`
edge is resolved to `ip-address@10.7.3` through a scoped npm override. The
tracker tests cover IPv4 conversion and fallback behavior, and the lockfile
must not contain the vulnerable `ip` package. Remove both controls when a
maintained tracker release removes the legacy edge and retains the tested
parser behavior. Owner: stream-server/platform maintainers.

Electron's download tooling resolves `http-cache-semantics@4.3.0` through a
root override while its consumers still allow the older 4.x range. Owner:
desktop platform maintainers. Remove the override when every download-tooling
consumer requires 4.3.0 or newer; review at the next dependency upgrade. The
tracker alias and ordinary ip-address paths use the same patched 10.7.3 line.

The root Hono override is constrained to the tested `4.13.x` line, and the
server/mobile direct dependencies resolve one compatible version. Keep the
override and direct specifications aligned when upgrading Hono so the Hono
adapters and shared client code are verified against one runtime contract.

The server currently has two intentionally separate Hono Node adapters: the
server workspace declares the 2.x line, currently locked at
`@hono/node-server@2.1.3`, while `@hono/node-ws@1.3.1` requires a `^1.19.11`
peer. Version 2.1.3 includes the fix for the path double-decode middleware
bypass in GHSA-rmxm-3fg6-px4f. The private root workspace declares the exact
`@hono/node-server@1.19.17` peer so npm installs that compatibility adapter
alongside the server-local 2.x package. `npm run dependency:compatibility:test`
asserts this topology and that the resolved server adapter satisfies its
workspace range; remove the root peer when `@hono/node-ws` supports the 2.x
adapter.

NativeWind `4.2.x` currently brings `react-native-css-interop@0.2.6`, whose
Tailwind peer contract is the Tailwind 3 line. The mobile workspace therefore
pins `tailwindcss@3.4.19`; keep the compatibility test in place and review the
NativeWind migration before accepting a Tailwind 4 major bump.

The mobile app now follows Expo SDK58's React `19.3.0`, React Native
`0.88.0`, Reanimated `4.7.1`, Worklets `0.13.0`, safe-area-context
`5.10.1`, and react-native-screens `4.30.0` compatibility versions. Sentry
React Native `8.31.x`, AsyncStorage `3.1.1`, and Flash List `2.3.3` remain
intentional `expo.install.exclude` exceptions because the workspace tracks
them above the SDK's bundled recommendations. These exclusions are not
permission to skip native validation. AsyncStorage 3 keeps its
`@react-native-async-storage/async-storage/jest` entrypoint; native-device
validation remains deferred.

The current native/tooling migration keeps the Expo SDK58 contract on React
`19.3.0` and React Native `0.88.0`. Root and mobile workspaces pin React
Native and `@react-native/jest-preset` to `0.88.0` so npm's hoisted Expo peer
dependencies cannot resolve an older RN line. React Native Testing Library
`14.0.1` uses `test-renderer@1.3.1`, and `jest-expo@58.0.11` aligns with the
SDK preset and Jest `30.5.2` with `@types/jest@30.0.0`. Expo Modules Core 58
accepts Worklets `>=0.13.0`, matching Reanimated `4.7.1`. These modules use
the New Architecture and require a fresh native rebuild; prebuild and simulator
evidence are part of this migration's merge gate.

Android instrumentation builds also load the Expo aggregate `:expo` library.
Expo SDK 58 can contribute the same native runtime libraries from
`expo-updates` and React Native, so
`apps/mobile/plugins/withAndroidLibraryNativePackaging.js` adds Gradle
`pickFirsts` to every Android library module during Expo prebuild. This keeps
`assembleAndroidTest` deterministic without excluding the native runtime;
remove the plugin after an Expo upgrade confirms that the duplicate library
inputs no longer occur.

React Native Gesture Handler follows the same native-module boundary. The
mobile app and root override must stay on the same exact major/minor line; a
Dependabot bump is incomplete until `package.json`, the root override, and
`package-lock.json` agree. The current app request and root override resolve
to `3.3.0`. The RNGH 3 migration uses the hooks API
(`usePanGesture`/`GestureDetector`) and keeps the player timeline's keyboard,
accessibility, and web pointer contracts intact. Keep
`GestureHandlerRootView` around gesture consumers in native and Jest renders,
enable the RNGH Jest setup, and run the mobile suite plus iOS/Android smoke
builds before merging a future RNGH, React Native, or Expo major upgrade.

The server direct Hono Node adapter follows the 2.x line (currently `2.1.3`);
`@hono/node-ws@1.3.1` resolves its `^1.19.11` peer to the root
`@hono/node-server@1.19.17` package. The desktop app uses Electron `44.5.1` and
direct `@electron/notarize` `3.1.1`; electron-builder may retain its own nested
notarize 2.x contract. Keep these package paths as explicit compatibility
boundaries rather than forcing global overrides.

## PR-readiness security follow-up — 2026-10-25

The root Zod override now requires `^4.6.7`, matching the shared and server
consumer floor instead of allowing the lockfile to retain vulnerable 4.6.5.
The focused remediation suite verifies that oversized arrays, sets and maps
are rejected before their element validators run, while bounded inputs still
parse normally. The compatible body-parser resolution advances from 2.3.0
to 2.4.0. Its Node 18 minimum remains below the repository runtime; no framework,
native package, install-script permission or audit exception changes here.

The current master already resolves follow-redirects 1.16.1 and the Sentry CLI's
undici 6.29.1. Existing, verified node-forge patch ownership and its review date
remain authoritative; a passing policy audit does not mean the unpatched npm
tarball is free of findings. Owner: platform maintainers. Revisit the Zod
override when all consuming ranges enforce the fixed floor; keep production
audit, shared schema tests and dependency compatibility checks as the gates.

Sources: [body-parser advisory](https://github.com/advisories/GHSA-27r3-jxmh-p828),
[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
[Zod 4.6.7 release](https://github.com/colinhacks/zod/releases/tag/v4.6.7),
[undici 6.29.1 release](https://github.com/nodejs/undici/releases/tag/v6.29.1).

## Framework maintenance follow-up — 2026-10-27

The framework batch defers Expo SDK package updates that would also move the
config-plugin chain to Xcode 4. React and React DOM remain on 19.3.0,
gesture-handler remains on 3.3.0, and Expo Video stays on 58.0.11 with its
existing native patch until a separate compatible migration and native
validation are available.

The Sentry CLI install-script approval advances from 3.8.0 to exactly 3.8.1;
the separate 2.58.6 approval remains. The published installer script is byte
identical to 3.8.0 and uses the version-pinned platform package when present,
otherwise it can download a binary from the configured CDN. The published
package includes checksums, but its fallback can skip checksum validation when
an entry is absent or when explicitly configured to do so. CI disables lifecycle
scripts during installation and executes only its explicitly reviewed steps.
The updated platform binaries are integrity-pinned in the lockfile, but were
not independently audited here. Owner: mobile platform maintainers. Review the
exact installer and binary provenance again at the next Sentry CLI upgrade.
Source: [Sentry CLI 3.8.0 to 3.8.1 comparison](https://github.com/getsentry/sentry-cli/compare/3.8.0...3.8.1).

## Upgrade Routine

1. Switch to the pinned Node/npm versions.
2. Review `npm outdated --workspaces --include-workspace-root`.
3. Update direct dependencies in small, purpose-specific PRs.
4. Run the install-script policy, production audit, typechecks, tests, and
   release gate.
5. Review the full `npm audit` output and update the exception table when its
   contents change.

After any approved dependency or compatibility update, review this baseline
before the next release candidate.

Latest does not mean automatically accepting every major release. Framework
majors such as Expo, Electron, Prisma, or Vite require their own migration and
runtime QA rather than being folded into a security patch.

Prettier is pinned exactly to 3.9.6. Its formatter changes are intentionally
included in the dedicated dependency upgrade; future Prettier upgrades should
remain exact-version changes with repository-wide formatting and review of the
resulting churn.
