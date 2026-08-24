import assert from "node:assert/strict";
import test from "node:test";

import { analyzeChanges } from "./ci-affected.mjs";
import { buildVerificationPlan } from "./verify-change.mjs";

function ciPlan(files) {
  return analyzeChanges({
    eventName: "pull_request",
    baseSha: "base",
    headSha: "head",
    changedFiles: files,
  });
}

test("workflow policy changes receive focused local checks while CI stays fail-closed", () => {
  const files = [".github/workflows/ci.yml"];
  const local = buildVerificationPlan(files);
  const ci = ciPlan(files);

  assert.deepEqual(local.rules, ["workflow-policy"]);
  assert.deepEqual(local.focusedCommands, [
    "npm run process:check",
    "npm run workflows:check",
    "npm run workflows:check:test",
    "node --test scripts/ci-affected.test.mjs scripts/ci-needs-check.test.mjs",
  ]);
  assert.deepEqual(local.finalCommands, ["npm run verify:quick"]);
  assert.equal(ci.full_ci, true);
});

test("unknown paths fail closed in both policies without requiring identical commands", () => {
  const files = ["unclassified/policy.input"];
  const local = buildVerificationPlan(files);
  const ci = ciPlan(files);

  assert.deepEqual(local.rules, ["repository-code"]);
  assert.ok(local.focusedCommands.includes("npm run verify:quick"));
  assert.equal(ci.full_ci, true);
  assert.equal(ci.scope_reason, "unknown-path");
});

test("agent process assets keep their focused local path while unknown CI input stays full", () => {
  const files = [".agents/skill-registry.json"];
  const local = buildVerificationPlan(files);
  const ci = ciPlan(files);

  assert.deepEqual(local.rules, ["process"]);
  assert.ok(local.focusedCommands.includes("npm run process:check"));
  assert.equal(ci.full_ci, true);
});
