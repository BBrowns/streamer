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

export function findCiNeedFailures(needs) {
  const scope = needs.ci_scope?.outputs ?? {};

  return Object.entries(needs)
    .filter(([name, value]) => {
      if (name === "ci_scope") return value.result !== "success";
      if (value.result === "success") return false;

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
