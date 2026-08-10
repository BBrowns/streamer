import assert from "node:assert/strict";
import test from "node:test";

import {
  parseActionPins,
  summarizeAudit,
  summarizeOutdated,
} from "./collect.mjs";

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
