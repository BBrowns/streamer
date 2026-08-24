import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  validateHooks,
  validateAgentHandoff,
  validateMarkdownTreeLinks,
  validateProcessAssets,
  validateRuntimePolicy,
  validateSkillArchitecture,
  validateToolchainProjections,
} from "./validate-process-assets.mjs";

const validHandoff = `# Streamer Agent Handoff

## Current Project Phase
Current phase.

## Active Work
Active work.

## Release Blockers
Release blockers.

## Next Actions
Next actions.

## Canonical Sources
[Roadmap](./ROADMAP.md), [architecture](./ARCHITECTURE.md),
[playback](./PLAYBACK.md), [QA](./docs/QA_MATRIX.md),
[RC](./docs/RC_CHECKLIST.md),
[dependency security](./docs/DEPENDENCY_SECURITY.md), and
[golden paths](./docs/AUTOMATED_GOLDEN_PATHS.md).
`;

test("rejects broken links in nested skill references", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-skill-links-"));
  try {
    mkdirSync(join(root, "references"));
    writeFileSync(
      join(root, "references", "build.md"),
      "See [missing flow](missing.md).\n",
    );

    assert.deepEqual(validateMarkdownTreeLinks(root, "example"), [
      "example/references/build.md: missing linked resource missing.md",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("project process assets have valid metadata and portable hooks", () => {
  assert.deepEqual(validateProcessAssets(), []);
});

test("rejects a valid JSON hook file that disables required controls", () => {
  const errors = validateHooks({ hooks: {} });
  assert.ok(
    errors.some((error) =>
      error.includes("missing SessionStart/startup|resume"),
    ),
  );
  assert.ok(errors.some((error) => error.includes("missing PreToolUse/Bash")));
});

test("runtime hook derives the same toolchain policy as package.json", () => {
  assert.deepEqual(validateRuntimePolicy(), []);
});

function writeToolchainProjectionFixture(root, { node, npm }) {
  mkdirSync(join(root, "apps", "mobile"), { recursive: true });
  mkdirSync(join(root, "apps", "desktop", "scripts"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      engines: { node: ">=26.7.0 <27", npm: ">=12.0.2 <13" },
      packageManager: "npm@12.0.2",
    }),
  );
  writeFileSync(join(root, ".nvmrc"), `${node}\n`);
  writeFileSync(
    join(root, "apps", "mobile", "eas.json"),
    JSON.stringify({
      build: {
        development: { node },
        preview: { node },
        production: { node },
      },
    }),
  );
  writeFileSync(
    join(root, "apps", "desktop", "scripts", "vendor-node.js"),
    `const NODE_VERSION = "${node}";\n`,
  );
  writeFileSync(
    join(root, ".github", "workflows", "ci.yml"),
    `env:\n  NPM_VERSION: "${npm}"\njobs:\n  test:\n    steps:\n      - run: npx --yes "npm@\${NPM_VERSION}" ci\n`,
  );
}

test("accepts toolchain projections derived from root package metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-toolchain-valid-"));
  try {
    writeToolchainProjectionFixture(root, { node: "26.7.0", npm: "12.0.2" });
    assert.deepEqual(validateToolchainProjections(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports every stale Node and npm projection", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-toolchain-stale-"));
  try {
    writeToolchainProjectionFixture(root, { node: "25.0.0", npm: "11.0.0" });
    writeFileSync(
      join(root, ".github", "workflows", "refresh.yml"),
      "jobs:\n  refresh:\n    steps:\n      - run: npx --yes npm@12.0.1 ci\n",
    );

    const errors = validateToolchainProjections(root);
    assert.ok(errors.some((error) => error.startsWith(".nvmrc:")));
    assert.ok(errors.some((error) => error.includes("eas.json: development")));
    assert.ok(errors.some((error) => error.includes("eas.json: preview")));
    assert.ok(errors.some((error) => error.includes("eas.json: production")));
    assert.ok(errors.some((error) => error.includes("vendor-node.js:")));
    assert.ok(errors.some((error) => error.includes("ci.yml: NPM_VERSION")));
    assert.ok(
      errors.some((error) => error.includes("refresh.yml: inline npm pin")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a compact handoff with current sections and canonical sources", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-handoff-valid-"));
  try {
    writeFileSync(join(root, "AGENT_HANDOFF.md"), validHandoff);
    assert.deepEqual(validateAgentHandoff(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects stale handoffs that omit sections or exceed the context budget", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-handoff-invalid-"));
  try {
    writeFileSync(
      join(root, "AGENT_HANDOFF.md"),
      `# Streamer Agent Handoff\n\n## Current Project Phase\n${"history ".repeat(1201)}`,
    );
    const errors = validateAgentHandoff(root);
    assert.ok(errors.some((error) => error.includes("missing ## Active Work")));
    assert.ok(errors.some((error) => error.includes("exceeds 1200 words")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("repository skill architecture is compact and complete", () => {
  assert.deepEqual(validateSkillArchitecture(), []);
});
