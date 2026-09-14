#!/usr/bin/env node

export const scopeKeyByJob = Object.freeze({
  "lint-and-typecheck": "run_lint",
  "format-check": "run_format",
  "security-audit": "run_security",
  "test-shared": "run_shared",
  "test-server": "run_server",
  "test-stream-server": "run_stream_server",
  "test-mobile": "run_mobile",
  "test-golden-path": "run_golden_path",
  "visual-regression": "run_visual",
  "build-check": "run_build",
  "server-container": "run_server_container",
  "desktop-package": "run_desktop_package",
});

const PREFLIGHT_BLOCKED_JOBS = new Set([
  ...Object.keys(scopeKeyByJob),
  "golden_path_gate",
]);

export function findCiNeedFailures(needs) {
  const scope = needs.ci_scope?.outputs ?? {};
  const preflightResult = needs["dependency-install-preflight"]?.result;
  const preflightBlocked = ["failure", "cancelled"].includes(preflightResult);

  return Object.entries(needs)
    .filter(([name, value]) => {
      if (name === "ci_scope") return value.result !== "success";
      if (
        name === "dependency-install-preflight" &&
        value.result === "skipped" &&
        scope.run_install_preflight !== "true"
      ) {
        return false;
      }
      if (value.result === "success") return false;

      // A failed or cancelled dependency preflight is the root failure. Jobs
      // that depend on it are intentionally skipped so the release gate does
      // not fan out the same install error into secondary failures.
      if (
        preflightBlocked &&
        value.result === "skipped" &&
        PREFLIGHT_BLOCKED_JOBS.has(name)
      ) {
        return false;
      }

      const scopeKey = scopeKeyByJob[name];
      return !(
        value.result === "skipped" &&
        scopeKey &&
        scope[scopeKey] === "false" &&
        scope.full_ci === "false"
      );
    })
    .map(([name, value]) => `${name}:${value.result}`);
}

function main() {
  const needs = JSON.parse(process.env.CI_NEEDS ?? "{}");
  const failures = findCiNeedFailures(needs);
  if (failures.length > 0) {
    console.error(`Required CI jobs did not succeed: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("All selected CI jobs succeeded.");
}

if (process.argv[1]?.endsWith("ci-needs-check.mjs")) {
  main();
}
