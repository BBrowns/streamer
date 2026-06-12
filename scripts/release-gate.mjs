#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const failures = [];
const passes = [];

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return existsSync(join(repoRoot, relativePath));
}

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function requireFile(relativePath) {
  if (exists(relativePath)) {
    pass(`${relativePath} exists`);
  } else {
    fail(`${relativePath} is missing`);
  }
}

function requireText(relativePath, needle, label = needle) {
  const content = read(relativePath);
  if (content.includes(needle)) {
    pass(`${relativePath} contains ${label}`);
  } else {
    fail(`${relativePath} must contain ${label}`);
  }
}

function requirePattern(relativePath, pattern, label) {
  const content = read(relativePath);
  if (pattern.test(content)) {
    pass(`${relativePath} matches ${label}`);
  } else {
    fail(`${relativePath} must match ${label}`);
  }
}

function checkCiWorkflow() {
  const workflow = ".github/workflows/ci.yml";
  requireFile(workflow);

  const requiredSnippets = [
    ["npm run format:check", "format check"],
    ["npm run typecheck:all", "all-workspace typecheck"],
    ["npm run test --workspace=@streamer/shared", "shared tests"],
    ["npm run test --workspace=server -- --coverage", "server coverage tests"],
    ["npm run test --workspace=@streamer/stream-server", "stream-server tests"],
    [
      "npm run test --workspace=apps/mobile -- --runInBand",
      "mobile Jest tests",
    ],
    ["npm run package:check --workspace=@streamer/desktop", "desktop smoke"],
    [
      "npm run release:check --workspace=@streamer/desktop",
      "desktop release config smoke",
    ],
    ["npm run release:gate", "release gate"],
    ["ci-summaries", "test summary artifacts"],
    ["apps/desktop/release", "desktop package artifact"],
    ["actions/upload-artifact@v4", "artifact upload"],
  ];

  for (const [needle, label] of requiredSnippets) {
    requireText(workflow, needle, label);
  }
}

function checkDocs() {
  requireFile("docs/QA_MATRIX.md");
  requireFile("docs/QA_RUNBOOK.md");
  requireFile("AGENT_HANDOFF.md");
  requireText("AGENT_HANDOFF.md", "docs/QA_MATRIX.md", "QA matrix link");
  requireText("docs/QA_MATRIX.md", "## Release Blockers", "release blockers");
  requireText("docs/QA_MATRIX.md", "Unknown", "unknown target states");

  const releaseClaimPattern =
    /(release\s*ready\s*:\s*(yes|true)|status\s*:\s*release[- ]ready|go\/no-go\s*:\s*go)/i;
  const checkedDocs = [
    "AGENT_HANDOFF.md",
    "README.md",
    "docs/QA_MATRIX.md",
    "docs/QA_RUNBOOK.md",
    "docs/SENTRY_RELEASES.md",
    "docs/BUILD_METADATA.md",
    "docs/MACOS_RELEASE.md",
  ];

  for (const relativePath of checkedDocs) {
    if (!exists(relativePath)) continue;
    if (releaseClaimPattern.test(read(relativePath))) {
      fail(
        `${relativePath} appears to claim release-ready status; record RC evidence before making that claim`,
      );
    } else {
      pass(`${relativePath} has no explicit release-ready claim`);
    }
  }
}

function checkProductionDefaults() {
  requirePattern(
    "server/src/config/env.ts",
    /STREAMER_BRIDGE_SUPERVISOR:\s*z\.string\(\)\.default\("false"\)/,
    "bridge supervisor disabled by default",
  );
  requirePattern(
    "server/src/config/env.ts",
    /SENTRY_ENABLE_DEV:\s*z\.string\(\)\.default\("false"\)/,
    "server Sentry dev capture disabled by default",
  );
  requirePattern(
    "server/src/app.ts",
    /env\.nodeEnv\s*!==\s*"production"\s*&&\s*DEV_LAN_ORIGIN_PATTERN\.test\(origin\)/,
    "LAN CORS only outside production",
  );
  requirePattern(
    "apps/mobile/services/sentryConfig.ts",
    /Boolean\(dsn\)\s*&&\s*input\.nodeEnv\s*!==\s*"test"\s*&&\s*\(!input\.isDev\s*\|\|\s*input\.enableInDev\s*===\s*"true"\)/,
    "mobile Sentry disabled in dev by default",
  );
  requirePattern(
    "apps/desktop/src/sentry.js",
    /Boolean\(dsn\)\s*&&\s*nodeEnv\s*!==\s*"test"\s*&&\s*\(nodeEnv\s*===\s*"production"\s*\|\|\s*enableDev\)/,
    "desktop Sentry disabled in dev by default",
  );
}

function checkSecurityCoverage() {
  const requiredTests = [
    "server/tests/redaction.unit.test.ts",
    "server/tests/security-url.unit.test.ts",
    "server/tests/sentry.unit.test.ts",
    "packages/stream-server/src/__tests__/security.test.ts",
    "packages/stream-server/src/__tests__/sentry.test.ts",
    "apps/desktop/src/electron-hardening.test.js",
    "apps/desktop/src/security.test.js",
    "apps/mobile/services/__tests__/redaction.test.ts",
    "apps/mobile/services/__tests__/sentryConfig.test.ts",
    "apps/mobile/services/__tests__/sentryBreadcrumbs.test.ts",
  ];

  for (const testFile of requiredTests) {
    requireFile(testFile);
  }

  requireText(
    "docs/SENTRY_RELEASES.md",
    "They must not include:",
    "Sentry breadcrumb forbidden data policy",
  );
  requireText(
    "docs/SENTRY_RELEASES.md",
    "raw media URLs",
    "raw media URL redaction policy",
  );
  requireText("docs/SENTRY_RELEASES.md", "magnets", "magnet redaction policy");
}

function writeSummary() {
  const outputDir = join(repoRoot, "artifacts/ci-summaries");
  mkdirSync(outputDir, { recursive: true });

  const lines = [
    "# Release Gate Summary",
    "",
    `Result: ${failures.length === 0 ? "pass" : "fail"}`,
    "",
    "## Passed Checks",
    ...passes.map((item) => `- ${item}`),
    "",
    "## Failed Checks",
    ...(failures.length > 0 ? failures.map((item) => `- ${item}`) : ["- None"]),
    "",
  ];

  writeFileSync(join(outputDir, "release-gate.md"), lines.join("\n"));
  console.log(lines.join("\n"));
}

checkCiWorkflow();
checkDocs();
checkProductionDefaults();
checkSecurityCoverage();
writeSummary();

if (failures.length > 0) {
  process.exit(1);
}
