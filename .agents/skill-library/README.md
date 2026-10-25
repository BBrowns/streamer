# Portable application skills

This directory is the versioned source for four standalone skills:
`contract-change`, `reliability-change`, `dependency-change` and
`incident-response`. Each complete skill folder can be copied to a personal
Codex skills directory or another project's `.agents/skills`.

## Ownership and discovery

- The portable core owns the reusable workflow and its internal references.
- Conditional stack guidance lives with the core, such as
  `dependency-change/references/javascript.md`.
- `.agents/skills/streamer-*` entrypoints keep Streamer product, privacy,
  runtime and verification rules. They read the adjacent portable source;
  clones and isolated evaluations need no personal skill installation.

The library deliberately sits outside `.agents/skills`, so Streamer exposes its
existing project entrypoints without discovering a second copy of the generic
names. An installed generic skill and a project overlay compose one workflow.
Use the project's existing plan, checks and review requirements; do not stack
equivalent planning or review ceremonies from other skill bundles. An optional
specialist is loaded only when its own trigger applies and it is available.

## Personal installation

Copy each complete folder into `${CODEX_HOME:-$HOME/.codex}/skills` with its
directory name unchanged. Inspect an existing destination before replacing it;
do not overwrite an unrelated skill. The installed copy needs only its own
folder, with no absolute source paths or sibling skills.

Keep this library authoritative for changes made here. Refresh an installed
copy after reviewing source changes, and compare its complete file inventory
and bytes to avoid drift. Do not point the Streamer overlays at a personal
installation or create machine-specific links in the repository.

Other projects supply their own schema ownership, sensitive-data rules,
package manager, runtime, test commands and production authorization. The core
does not require Streamer scripts, a telemetry vendor or an additional plugin.

## Validation

`npm run process:check` validates library metadata and resource containment.
`npm run process:check:test` covers copy isolation and malformed resources.
Enabled skill-outcome fixtures include the library alongside the overlays;
disabled fixtures omit both. These structural checks complement fresh-context
application scenarios and do not prove skill effectiveness on every task.
