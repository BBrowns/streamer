# Dependency Security Baseline

Streamer pins its development toolchain to **Node.js 24.18 LTS** and
**npm 11.18**. Use the repository `.nvmrc` before installing dependencies:

```bash
nvm install
nvm use
npm install --global npm@11.18.0
npm ci
```

Server development, typecheck, build, and test commands generate Prisma Client
before execution. This keeps a clean checkout reproducible without relying on a
previous `node_modules/.prisma` directory.

Node 25 is not supported. It is a non-LTS release and installing native
dependencies with a different Node/Electron architecture can leave the desktop
bridge unable to load `node-datachannel`.

## CI Policy

Pull requests block on:

```bash
npm run security:install-scripts
npm run security:audit
```

`security:audit` rejects **high and critical production dependency findings**.
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

| Dependency path                               | Scope                                                              | Current decision                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma tooling -> `@hono/node-server@1.19.11` | Development/build tooling; moderate finding                        | Keep Prisma current and remove the exception when its toolchain updates. Runtime Hono and the direct Node adapter use patched 1.x releases compatible with `@hono/node-ws`. |
| Expo/xcode tooling -> older `uuid`            | Mobile development tooling; moderate finding                       | Track Expo updates; do not force an incompatible nested major.                                                                                                              |
| Vite/tsx -> `esbuild@0.27.x`                  | Local development server only                                      | Direct stream-server builds use patched `esbuild@0.28.x`. Keep dev servers bound to trusted local interfaces and update with the upstream toolchain.                        |
| Testcontainers/node-gyp -> `undici`           | Test/build tooling only                                            | Track Testcontainers and node-gyp updates; it is not shipped in the application runtime.                                                                                    |
| WebTorrent -> bittorrent tracker -> `ip`      | Stream-server dependency with no fixed compatible upstream release | Keep URL/private-network controls and bridge authentication enabled; re-evaluate WebTorrent releases before RC.                                                             |

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

Prettier remains pinned to 3.8.1 because 3.9 changes formatting across unrelated
source files. Upgrade it in a dedicated formatting-only change rather than
mixing repository-wide churn into dependency security work.
