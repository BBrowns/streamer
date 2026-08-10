import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

import {
  parseRemote,
  parseActionPins,
  summarizeAudit,
  summarizeOutdated,
} from "./collect.mjs";

test("rejects remotes with credentials or non-GitHub API path components", () => {
  assert.equal(parseRemote("https://user:secret@github.com/owner/repo.git"), null);
  assert.equal(parseRemote("https://github.com/owner/repo.git"), "owner/repo");
  assert.equal(parseRemote("git@github.com:owner/repo.git"), "owner/repo");
});

test("summarizes audit severities without exposing advisory details", () => {
  const summary = summarizeAudit({
    vulnerabilities: {
      one: { severity: "high", via: [{ title: "secret-looking detail" }] },
      two: { severity: "moderate", via: [] },
    },
  });

  assert.deepEqual(summary, {
    available: true,
    total: 2,
    counts: { critical: 0, high: 1, moderate: 1, low: 0, info: 0 },
  });
  assert.equal(JSON.stringify(summary).includes("secret-looking"), false);
});

test("summarizes outdated packages with bounded version data", () => {
  const summary = summarizeOutdated({
    "package-a": { current: "1.0.0", wanted: "1.1.0", latest: "2.0.0" },
  });

  assert.deepEqual(summary, {
    available: true,
    count: 1,
    packages: [
      { name: "package-a", current: "1.0.0", wanted: "1.1.0", latest: "2.0.0" },
    ],
    truncated: false,
  });
});

test("detects tag-pinned workflow actions", () => {
  const result = parseActionPins(process.cwd());
  assert.ok(result.workflowCount >= 3);
  assert.ok(result.actionCount > 0);
  assert.ok(
    result.unpinnedCount > 0,
    "baseline should expose current tag-pinned actions",
  );
  assert.ok(result.unpinned.every((entry) => !entry.action.includes("secret")));
});

test("detects folded YAML action references", () => {
  const root = mkdtempSync(join(process.cwd(), ".maintenance-test-"));
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    writeFileSync(
      join(root, ".github", "workflows", "folded.yml"),
      "steps:\n  - uses: >-\n      actions/checkout@v4\n",
    );
    const result = parseActionPins(root);
    assert.equal(result.actionCount, 1);
    assert.equal(result.unpinnedCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
