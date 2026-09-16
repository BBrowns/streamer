import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { findCiNeedFailures } from "./ci-needs-check.mjs";

const scope = (overrides = {}) => ({
  result: "success",
  outputs: {
    full_ci: "false",
    run_lint: "true",
    run_format: "true",
    run_security: "true",
    run_shared: "true",
    run_server: "true",
    run_stream_server: "true",
    run_mobile: "true",
    run_golden_path: "true",
    run_visual: "true",
    run_build: "true",
    run_server_container: "true",
    run_desktop_package: "true",
    run_install_preflight: "false",
    ...overrides,
  },
});

test("accepts successful selected jobs", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope(),
      "workflow-lint": { result: "success" },
      "test-server": { result: "success" },
    }),
    [],
  );
});

test("accepts jobs intentionally skipped by affected CI", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ run_server: "false" }),
      "workflow-lint": { result: "success" },
      "test-server": { result: "skipped" },
    }),
    [],
  );
});

test("accepts an install preflight that is intentionally out of scope", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ run_install_preflight: "false" }),
      "dependency-install-preflight": { result: "skipped" },
      "workflow-lint": { result: "success" },
    }),
    [],
  );
});

test("accepts push-style full CI when install preflight is intentionally skipped", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ full_ci: "true", run_install_preflight: "false" }),
      "dependency-install-preflight": { result: "skipped" },
      "workflow-lint": { result: "success" },
      "golden_path_gate": { result: "success" },
    }),
    [],
  );
});

test("uses the shared CI needs checker for push release gates", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    workflow,
    /elif \[\[ -f scripts\/ci-needs-check\.mjs \]\]; then[\s\S]*?node scripts\/ci-needs-check\.mjs/,
  );
});

test("accepts the existing visual regression job when visual checks are out of scope", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ run_visual: "false" }),
      "visual-regression": { result: "skipped" },
    }),
    [],
  );
});

test("rejects skipped jobs during full CI", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ full_ci: "true" }),
      "workflow-lint": { result: "success" },
      "test-server": { result: "skipped" },
    }),
    ["test-server:skipped"],
  );
});

test("rejects an unexpected skip or failed detector", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: { result: "failure", outputs: {} },
      "workflow-lint": { result: "skipped" },
      "test-server": { result: "failure" },
    }),
    ["ci_scope:failure", "workflow-lint:skipped", "test-server:failure"],
  );
});

test("rejects a skipped job without a declared scope mapping", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ run_server: "false" }),
      "unknown-job": { result: "skipped" },
    }),
    ["unknown-job:skipped"],
  );
});

test("reports only the dependency preflight when it blocks downstream jobs", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ full_ci: "true", run_install_preflight: "true" }),
      "dependency-install-preflight": { result: "failure" },
      "workflow-lint": { result: "success" },
      "lint-and-typecheck": { result: "skipped" },
      "format-check": { result: "skipped" },
      "test-server": { result: "skipped" },
      golden_path_gate: { result: "skipped" },
      "release-gate": { result: "failure" },
    }),
    ["dependency-install-preflight:failure", "release-gate:failure"],
  );
});

test("reports only a cancelled dependency preflight and the release gate", () => {
  assert.deepEqual(
    findCiNeedFailures({
      ci_scope: scope({ full_ci: "true", run_install_preflight: "true" }),
      "dependency-install-preflight": { result: "cancelled" },
      "workflow-lint": { result: "success" },
      "lint-and-typecheck": { result: "skipped" },
      "test-server": { result: "skipped" },
      golden_path_gate: { result: "skipped" },
      "release-gate": { result: "failure" },
    }),
    ["dependency-install-preflight:cancelled", "release-gate:failure"],
  );
});
