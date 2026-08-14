# Dependency Security Baseline

Streamer pins its development toolchain to **Node.js 26.7.0** and
**npm 12.0.2**. Use the repository `.nvmrc` before installing dependencies:

```bash
nvm install
nvm use
npm install --global npm@12.0.2
npm ci
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
npm run security:install-scripts
npm run security:audit
```

CI also:

- validates every GitHub Actions workflow with `actionlint@v1.7.12`;
- requires external GitHub Actions to use reviewed full commit SHAs;
- reviews the dependency delta on pull requests and blocks newly introduced
  high or critical advisories;
- checks npm and GitHub Actions dependency drift through grouped weekly
  Dependabot updates;
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

## Reviewed Transitive Findings

These exceptions do not block the production high/critical audit. Re-evaluate
them before the next release candidate or by **2026-09-30**, whichever comes
first. Owners: platform maintainers.

| Dependency path                                                  | Scope                                                                          | Current decision                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma tooling -> `@hono/node-server@1.19.11`                    | Development/build tooling; moderate finding                                    | Keep Prisma current and remove the exception when its toolchain updates. Runtime Hono and the direct Node adapter use patched 1.x releases compatible with `@hono/node-ws`.                                                                                                                                                                                                                                                                                           |
| Expo/xcode tooling -> older `uuid`                               | Mobile development tooling; moderate finding                                   | Track Expo updates; do not force an incompatible nested major.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Vite/tsx -> `esbuild@0.27.x`                                     | Local development server only                                                  | Direct stream-server builds use patched `esbuild@0.28.x`. Keep dev servers bound to trusted local interfaces and update with the upstream toolchain.                                                                                                                                                                                                                                                                                                                  |
| Testcontainers/node-gyp -> `undici`                              | Test/build tooling only                                                        | Track Testcontainers and node-gyp updates; it is not shipped in the application runtime.                                                                                                                                                                                                                                                                                                                                                                              |
| WebTorrent -> bittorrent tracker -> `ip`                         | Stream-server development dependency with no fixed compatible upstream release | `bittorrent-tracker@11.2.3` is patched locally to replace its single UDP integer-to-IPv4 conversion and no application code imports `ip`. The package remains in the lockfile because npm resolves the published package before `patch-package` runs; treat the upstream advisory as a reviewed development-only exception and remove this patch when a maintained tracker release removes `ip`. Keep URL/private-network controls and bridge authentication enabled. |
| React Native/Jest tooling -> `test-exclude` -> `brace-expansion` | Transform and test tooling; high resource-exhaustion finding                   | Advisory `GHSA-mh99-v99m-4gvg` has no patched 1.x release. The audit exception accepts only `node_modules/test-exclude/node_modules/brace-expansion`; a new path still fails CI. Do not force 5.x into legacy `minimatch`, whose CommonJS callable API is incompatible. Inputs are repository-controlled globs, not remote user patterns. Exception expires 2026-09-30 or before the next RC; upgrade the owning Expo toolchain when a compatible fix ships.          |
| Expo/Metro -> `image-size`                                       | Mobile development/build tooling; high parser resource-exhaustion findings     | `image-size@1.2.1` is patched locally to advance zero-sized ICNS entries and already contains the equivalent JXL/HEIF zero-progress guard. The exact root node remains reviewed because Metro owns the 1.x parser contract and no fixed compatible npm release exists. Exception expires 2026-09-30 or before the next RC; replace the patch when Expo/Metro adopts a fixed release.                                                                                  |

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
range is stuck on the vulnerable `uuid@7` line. The root development pin and
scoped `xcode` override resolve `uuid@11.1.1`, whose CommonJS API still exposes
the `uuid.v4()` call that `xcode` uses, without forcing the newer UUID major
onto the server workspace. `npm run dependency:compatibility:test` exercises
that exact integration. Remove the pin and override when the Expo toolchain
ships an `xcode` release with a patched UUID range, and retain the lockfile/API
smoke check when doing so.

The root Hono override is pinned to `4.13.2`, and the server/mobile direct
dependencies resolve that same tested line. Keep the override and direct
specifications aligned when upgrading Hono so the Hono adapters and shared
client code are verified against one runtime contract.

The mobile app intentionally tracks React `19.2.8` and the compatible
React Native `4.5.x` native-module line ahead of Expo SDK 57's bundled patch
versions. The corresponding `expo.install.exclude` entries are reviewed
exceptions, not permission to skip native validation; revisit them with the
next Expo SDK upgrade and rebuild native projects after changing these modules.
`@shopify/flash-list` is also an existing intentional exception because the
repository tracks its tested release above the SDK 57 bundled version.

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
