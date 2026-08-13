import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  analyzeChanges,
  ciJobNames,
  writeGitHubOutputs,
} from "./ci-affected.mjs";

const pr = (changedFiles) =>
  analyzeChanges({
    eventName: "pull_request",
    baseSha: "base",
    headSha: "head",
    changedFiles,
  });

test("runs full CI for non-pull-request events", () => {
  const result = analyzeChanges({ eventName: "push" });

  assert.equal(result.full_ci, true);
  for (const job of ciJobNames) assert.equal(result[`run_${job}`], true);
});

test("runs only formatting for documentation-only pull requests", () => {
  const result = pr(["docs/CI_RELEASE_GATES.md", "README.md"]);

  assert.equal(result.full_ci, false);
  assert.equal(result.run_format, true);
  assert.equal(result.run_lint, false);
  assert.equal(result.run_server, false);
  assert.equal(result.run_mobile, false);
  assert.equal(result.run_golden_path, false);
});

test("selects mobile and browser validation for mobile source changes", () => {
  const result = pr(["apps/mobile/components/ui/PageLayout.tsx"]);

  assert.equal(result.full_ci, false);
  assert.equal(result.run_lint, true);
  assert.equal(result.run_format, true);
  assert.equal(result.run_mobile, true);
  assert.equal(result.run_golden_path, true);
  assert.equal(result.run_visual, true);
  assert.equal(result.run_build, true);
  assert.equal(result.run_server, false);
});

test("selects server, container, and build validation for server source changes", () => {
  const result = pr(["server/src/modules/catalog/catalog.routes.ts"]);

  assert.equal(result.full_ci, false);
  assert.equal(result.run_server, true);
  assert.equal(result.run_server_container, true);
  assert.equal(result.run_build, true);
  assert.equal(result.run_mobile, false);
  assert.equal(result.run_golden_path, false);
});

test("uses full CI for shared package changes", () => {
  const result = pr(["packages/shared/src/playback/session.ts"]);

  assert.equal(result.full_ci, true);
  assert.match(result.scope_reason, /full-ci-path/);
});

test("uses full CI for workflow and lockfile changes", () => {
  for (const path of [".github/workflows/ci.yml", "package-lock.json"]) {
    const result = pr([path]);
    assert.equal(result.full_ci, true);
    assert.equal(result.run_desktop_package, true);
  }
});

test("uses full CI for native and release-sensitive changes", () => {
  for (const path of [
    "apps/mobile/app.config.js",
    "apps/desktop/src/electron-hardening.test.js",
    "packages/stream-server/src/native/engine.ts",
    "packages/stream-server/src/security.ts",
  ]) {
    const result = pr([path]);
    assert.equal(result.full_ci, true, path);
  }
});

test("fails closed for unknown paths or missing PR refs", () => {
  assert.equal(pr(["config/new-runtime-policy.toml"]).full_ci, true);
  assert.equal(
    analyzeChanges({
      eventName: "pull_request",
      baseSha: "",
      headSha: "head",
      changedFiles: ["docs/CI_RELEASE_GATES.md"],
    }).full_ci,
    true,
  );
});

test("writes boolean scope outputs in GitHub output format", () => {
  const directory = mkdtempSync(join(tmpdir(), "streamer-ci-scope-"));
  const outputPath = join(directory, "github-output");

  try {
    writeGitHubOutputs(
      { full_ci: false, run_mobile: true, scope_reason: "test" },
      outputPath,
    );
    assert.equal(
      readFileSync(outputPath, "utf8"),
      "full_ci=false\nrun_mobile=true\nscope_reason=test\n",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
