import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";

import {
  findJobsWithoutTimeout,
  findMissingMergeQueueTriggers,
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
