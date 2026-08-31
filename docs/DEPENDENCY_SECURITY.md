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

## Reviewed Transitive Findings

These exceptions do not block the production high/critical audit. Re-evaluate
them before the next release candidate or by **2026-09-30**, whichever comes
first. Owners: platform maintainers.

| Dependency path                                                  | Scope                                                        | Current decision                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@hono/node-ws@1.3.1` -> root peer `@hono/node-server@1.19.17`   | Server runtime peer compatibility; moderate finding          | The private root workspace declares an exact 1.19.17 peer so npm installs the adapter required by `@hono/node-ws`, while the server workspace keeps its direct `@hono/node-server@2.1.1` runtime adapter. The lockfile contract test asserts both versions; remove this exception when the WebSocket adapter moves to the 2.x line.                                                                                                                          |
| Expo/xcode tooling -> older `uuid`                               | Mobile development tooling; moderate finding                 | The root tooling pin is now `uuid@14.0.2`, while `xcode@3.0.1` keeps a scoped nested `uuid@11.1.1` override for its CommonJS helper. Remove the nested override when Expo ships an xcode release that supports the newer UUID API.                                                                                                                                                                                                                           |
| Vite/tsx -> `esbuild@0.27.x`                                     | Local development server only                                | Direct stream-server builds use patched `esbuild@0.28.x`. Keep dev servers bound to trusted local interfaces and update with the upstream toolchain.                                                                                                                                                                                                                                                                                                         |
| Testcontainers/node-gyp -> `undici`                              | Test/build tooling only                                      | Track Testcontainers and node-gyp updates; it is not shipped in the application runtime.                                                                                                                                                                                                                                                                                                                                                                     |
| React Native/Jest tooling -> `test-exclude` -> `brace-expansion` | Transform and test tooling; high resource-exhaustion finding | Advisory `GHSA-mh99-v99m-4gvg` has no patched 1.x release. The audit exception accepts only `node_modules/test-exclude/node_modules/brace-expansion`; a new path still fails CI. Do not force 5.x into legacy `minimatch`, whose CommonJS callable API is incompatible. Inputs are repository-controlled globs, not remote user patterns. Exception expires 2026-09-30 or before the next RC; upgrade the owning Expo toolchain when a compatible fix ships. |

## Compatibility Overrides

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
edge is resolved to `ip-address@10.5.0` through a scoped npm override. The
tracker tests cover IPv4 conversion and fallback behavior, and the lockfile
must not contain the vulnerable `ip` package. Remove both controls when a
maintained tracker release removes the legacy edge and retains the tested
parser behavior. Owner: stream-server/platform maintainers.

The root Hono override is constrained to the tested `4.13.x` line, and the
server/mobile direct dependencies resolve one compatible version. Keep the
override and direct specifications aligned when upgrading Hono so the Hono
adapters and shared client code are verified against one runtime contract.

The server currently has two intentionally separate Hono Node adapters: the
server workspace imports `@hono/node-server@2.1.1`, while `@hono/node-ws@1.3.1`
requires a `^1.19.11` peer. The private root workspace declares the exact
`@hono/node-server@1.19.17` peer so npm installs that compatibility adapter
alongside the server-local 2.x package. `npm run dependency:compatibility:test`
asserts this topology; remove the root peer when `@hono/node-ws` supports the
2.x adapter.

NativeWind `4.2.x` currently brings `react-native-css-interop@0.2.6`, whose
Tailwind peer contract is the Tailwind 3 line. The mobile workspace therefore
pins `tailwindcss@3.4.19`; keep the compatibility test in place and review the
NativeWind migration before accepting a Tailwind 4 major bump.

The mobile app intentionally tracks React `19.2.8` and the compatible
React Native `4.5.x` native-module line ahead of Expo SDK 57's bundled patch
versions. The corresponding `expo.install.exclude` entries are reviewed
exceptions, not permission to skip native validation; revisit them with the
next Expo SDK upgrade and rebuild native projects after changing these modules.
AsyncStorage `3.1.1` is also intentionally excluded because Expo SDK 57 still
advertises the 2.x line; its new Jest entrypoint and the repository's full
mobile suite are covered, while native-device validation remains deferred.
`@shopify/flash-list` is also an existing intentional exception because the
repository tracks its tested release above the SDK 57 bundled version.

The current native/tooling migration keeps the Expo SDK 57 contract on React
`19.2.8` and React Native `0.86.2`. React Native Testing Library `14.0.1`
therefore uses `test-renderer@1.2.0`, the React 19-compatible replacement for
the deprecated direct `react-test-renderer` dependency. `jest-expo@57` may
still retain a nested React test renderer internally; that does not justify a
Jest 30 migration. AsyncStorage 3 also changes its Jest mock entrypoint to
`@react-native-async-storage/async-storage/jest`. The tested native upgrades
are safe-area-context `5.9.0`, worklets `0.11.4`, and Sentry React Native
`8.23.x`; keep them aligned with Expo before changing the SDK major.

React Native Gesture Handler follows the same native-module boundary. The
mobile app and root override must stay on the same exact major/minor line; a
Dependabot bump is incomplete until `package.json`, the root override, and
`package-lock.json` agree. The current RNGH 3 migration uses the hooks API
(`usePanGesture`/`GestureDetector`) and keeps the player timeline's keyboard,
accessibility, and web pointer contracts intact. Keep
`GestureHandlerRootView` around gesture consumers in native and Jest renders,
enable the RNGH Jest setup, and run the mobile suite plus iOS/Android smoke
builds before merging a future RNGH, React Native, or Expo major upgrade.

The server direct Hono Node adapter is on `2.1.1`, while `@hono/node-ws`
retains its nested adapter until an upstream compatible release exists. The
desktop app uses Electron `43.4.0` and direct `@electron/notarize` `3.1.1`;
electron-builder may retain its own nested notarize 2.x contract. These nested
paths are compatibility boundaries, not reasons to force global overrides.

## Upgrade Routine

1. Switch to the pinned Node/npm versions.
2. Review `npm outdated --workspaces --include-workspace-root`.
3. Update direct dependencies in small, purpose-specific PRs.
4. Run the install-script policy, production audit, typechecks, tests, and
   release gate.
5. Review the full `npm audit` output and update the exception table when its
   contents change.

Latest does not mean automatically accepting every major release. Framework
majors such as Expo, Electron, Prisma, or Vite require their own migration and
runtime QA rather than being folded into a security patch.

Prettier is pinned exactly to 3.9.6. Its formatter changes are intentionally
included in the dedicated dependency upgrade; future Prettier upgrades should
remain exact-version changes with repository-wide formatting and review of the
resulting churn.
