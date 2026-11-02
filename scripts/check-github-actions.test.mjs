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
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";
import semver from "semver";

import {
  findJobsWithoutTimeout,
  findMissingMergeQueueTriggers,
  findRequiredCheckContractViolations,
  findUnpinnedActions,
} from "./check-github-actions.mjs";

const dependabot = yaml
  .load(
    readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8"),
  )
  .updates.find((update) => update["package-ecosystem"] === "npm");
const lockfile = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
);

// Dependabot's '*' matches any characters, including scoped package names.
function matchesDependency(name, pattern) {
  return new RegExp(
    `^${pattern.split("*").map(RegExp.escape).join(".*")}$`,
  ).test(name);
}

function versionGroup(name, updateType) {
  return Object.entries(dependabot.groups).find(([, group]) => {
    return (
      (group["applies-to"] ?? "version-updates") === "version-updates" &&
      (!group["update-types"] || group["update-types"].includes(updateType)) &&
      group.patterns.some((pattern) => matchesDependency(name, pattern)) &&
      !(group["exclude-patterns"] ?? []).some((pattern) =>
        matchesDependency(name, pattern),
      )
    );
  })?.[0];
}

function autoMergeEligible(names, updateType, label = "true") {
  const workflow = yaml.load(
    readFileSync(
      new URL(
        "../.github/workflows/dependabot-auto-merge.yml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const policy = workflow.jobs["queue-safe-update"].steps.find(
    (step) => step.id === "policy",
  );
  const directory = mkdtempSync(join(tmpdir(), "streamer-auto-merge-"));
  const output = join(directory, "output");
  try {
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-c", policy.run],
      {
        encoding: "utf8",
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          GITHUB_OUTPUT: output,
          DEPENDENCY_NAMES: names,
          UPDATE_TYPE: updateType,
          HAS_DEPENDENCY_LABEL: label,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    return (
      readFileSync(output, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.startsWith("eligible="))
        .at(-1) === "eligible=true"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

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

for (const [name, migration] of [
  ["react-native", "minor"],
  ["@react-native/metro-config", "minor"],
  ["@react-native/jest-preset", "minor"],
  ["react-native-worklets", "minor"],
  ["react-native-reanimated", "minor"],
  ["jest", "major"],
  ["@types/jest", "major"],
]) {
  test(`Dependabot permits ${name} maintenance patches but holds the next migration`, () => {
    const current = lockfile.packages[`node_modules/${name}`].version;
    const ranges = dependabot.ignore
      .filter((rule) => matchesDependency(name, rule["dependency-name"]))
      .flatMap((rule) => rule.versions ?? []);
    for (const version of [current, semver.inc(current, "patch")]) {
      assert.ok(
        !ranges.some((range) => semver.satisfies(version, range)),
        `${name}@${version} must remain available for maintenance review`,
      );
    }
    assert.ok(
      ranges.some((range) =>
        semver.satisfies(semver.inc(current, migration), range),
      ),
      `${name}'s next ${migration} line requires a coordinated migration`,
    );
  });
}

test("protected npm version updates stay out of the ordinary maintenance group", () => {
  for (const updateType of ["patch", "minor"]) {
    for (const name of [
      "hono",
      "jest-expo",
      "jest",
      "@types/jest",
      "expo",
      "react-native",
      "@expo-google-fonts/instrument-serif",
      "@types/react",
      "@react-native-async-storage/async-storage",
      "@tanstack/react-query",
      "@testing-library/react-native",
      "electron-updater",
      "@electron/notarize",
      "electron-builder",
      "@scalar/hono-api-reference",
      "sharp",
      "better-sqlite3",
    ]) {
      assert.equal(
        versionGroup(name, updateType),
        "npm-framework-manual",
        name,
      );
    }
    assert.equal(versionGroup("vitest", updateType), "npm-vitest-manual");
    assert.equal(
      versionGroup("@vitest/coverage-v8", updateType),
      "npm-vitest-manual",
    );
    assert.equal(versionGroup("axios", updateType), "npm-minor-patch");
  }
});

test("auto-merge policy keeps coordinated toolchains manual, including mixed updates", () => {
  for (const updateType of [
    "version-update:semver-patch",
    "version-update:semver-minor",
  ]) {
    for (const names of [
      "jest",
      "@types/jest",
      "jest-expo",
      "hono",
      "axios, jest",
      "JEST",
    ]) {
      assert.equal(autoMergeEligible(names, updateType), false, names);
    }
    assert.equal(autoMergeEligible("axios", updateType), true);
  }
});

test("auto-merge policy fails closed for missing metadata, labels and major updates", () => {
  const patch = "version-update:semver-patch";
  assert.equal(autoMergeEligible("axios", patch, "false"), false);
  assert.equal(
    autoMergeEligible("axios", "version-update:semver-major"),
    false,
  );
  assert.equal(autoMergeEligible("axios", ""), false);
  assert.equal(autoMergeEligible("", patch), false);
  assert.equal(autoMergeEligible("  ", patch), false);
});
