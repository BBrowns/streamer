import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";

import {
  findJobsWithoutTimeout,
  findMissingMergeQueueTriggers,
  findRequiredCheckContractViolations,
  findUnpinnedActions,
} from "./check-github-actions.mjs";

test("all repository workflow actions use full commit SHAs", () => {
  assert.deepEqual(findUnpinnedActions(), []);
});

test("required workflows run for merge-queue checks", () => {
  assert.deepEqual(findMissingMergeQueueTriggers(), []);
});

test("every workflow job has a finite timeout", () => {
  assert.deepEqual(findJobsWithoutTimeout(), []);
});

test("required check contract matches current workflow publishers", () => {
  assert.deepEqual(findRequiredCheckContractViolations(), []);
});

test("required check contract rejects a missing or ambiguous publisher", () => {
  const root = mkdtempSync(join(tmpdir(), "streamer-required-checks-"));
  try {
    mkdirSync(join(root, ".github", "workflows"), { recursive: true });
    mkdirSync(join(root, ".github"), { recursive: true });
    writeFileSync(
      join(root, ".github", "required-checks.json"),
      JSON.stringify({
        requiredContexts: [
          { name: "Release Gate", source: "ci" },
          { name: "Review Dependency Changes", source: "dependency-review" },
          { name: "CodeQL", source: "external" },
        ],
      }),
    );
    writeFileSync(
      join(root, ".github", "workflows", "one.yml"),
      [
        "jobs:",
        "  release:",
        "    name: Release Gate",
        "    timeout-minutes: 5",
        "  duplicate:",
        "    name: Release Gate",
        "    timeout-minutes: 5",
        "  dependency:",
        "    name: Review Dependency Changes",
        "    timeout-minutes: 5",
        "  codeql:",
        "    name: CodeQL",
        "    timeout-minutes: 5",
        "",
      ].join("\n"),
    );

    const errors = findRequiredCheckContractViolations(root);
    assert.ok(
      errors.some((error) => error.includes("external context collides")),
    );
    assert.ok(errors.some((error) => error.includes("ambiguous")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Dependabot scans Compose with its own ecosystem and upgrades Vitest peers together", () => {
  const config = yaml.load(
    readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8"),
  );
  assert.ok(
    config.updates.some(
      (update) =>
        update["package-ecosystem"] === "docker-compose" &&
        update.directory === "/",
    ),
  );
  assert.ok(
    !config.updates.some(
      (update) =>
        update["package-ecosystem"] === "docker" && update.directory === "/",
    ),
  );
  const npm = config.updates.find(
    (update) => update["package-ecosystem"] === "npm",
  );
  const group = npm.groups["npm-vitest-manual"];
  assert.deepEqual(group.patterns, ["vitest", "@vitest/*"]);
  assert.ok(!group["update-types"] || group["update-types"].includes("major"));
  assert.ok(
    Object.keys(npm.groups).indexOf("npm-vitest-manual") <
      Object.keys(npm.groups).indexOf("npm-minor-patch"),
  );
});
