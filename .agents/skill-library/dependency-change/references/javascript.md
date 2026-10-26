# JavaScript And Native Toolchain Changes

Read only when the target project uses these ecosystems. Discover supported
versions and scripts from that project's manifests, configuration, CI, and
documentation; do not assume a particular package manager or runtime version.

- Check Node.js and package-manager compatibility, peer dependencies, workspace
  resolution, overrides, patches, lifecycle scripts, and lockfile reproducibility.
- For Expo/React Native, check the coordinated SDK/framework graph, native
  architecture, generated native projects, and supported mobile platforms.
- For Electron, check the embedded runtime, native ABI, architecture, renderer
  compatibility, and packaged behavior; a host-Node test does not prove an
  Electron native module loads.
- Coordinate Worklets, Reanimated, Jest, styling/build integrations, and similar
  framework-coupled packages when present. Semver-compatible ranges alone do not
  establish runtime compatibility.
- Use the project's runtime wrappers, install-script policy, audit policy,
  compatibility tests, and available native smoke checks. Do not copy installed
  native artifacts between incompatible runtimes or CPU architectures.
- For npm, keep lifecycle-script approvals narrow and inspect executable changes;
  do not approve a script merely to make installation succeed.

## Primary References

- [npm audit documentation](https://docs.npmjs.com/cli/commands/npm-audit/)
- [npm package provenance](https://docs.npmjs.com/viewing-package-provenance/)
