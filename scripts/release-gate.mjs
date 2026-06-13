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
  if (!exists(relativePath)) {
    fail(`${relativePath} is missing`);
    return;
  }
  const content = read(relativePath);
  if (content.includes(needle)) {
    pass(`${relativePath} contains ${label}`);
  } else {
    fail(`${relativePath} must contain ${label}`);
  }
}

function requirePattern(relativePath, pattern, label) {
  if (!exists(relativePath)) {
    fail(`${relativePath} is missing`);
    return;
  }
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
    ["npm run sentry:release:dry-run", "Sentry release dry-run"],
    ["npm run rc:evidence:test", "RC evidence generator test"],
    ["npm run rc:evidence", "RC evidence generation"],
    ["npm run release:gate", "release gate"],
    ["ci-summaries", "test summary artifacts"],
    ["rc-evidence-bundle", "RC evidence artifact"],
    ["apps/desktop/release", "desktop package artifact"],
    ["actions/upload-artifact@v4", "artifact upload"],
  ];

  for (const [needle, label] of requiredSnippets) {
    requireText(workflow, needle, label);
  }

  const releaseWorkflow = ".github/workflows/release-desktop.yml";
  requireFile(releaseWorkflow);
  for (const [needle, label] of [
    [
      "npm run package:mac:release --workspace=@streamer/desktop",
      "macOS release package command",
    ],
    ["STREAMER_NOTARIZE", "notarization gate"],
    ["softprops/action-gh-release", "GitHub Release draft action"],
    ["actions/upload-artifact@v4", "release artifact upload"],
  ]) {
    requireText(releaseWorkflow, needle, label);
  }
}

function checkDocs() {
  requireFile("docs/QA_MATRIX.md");
  requireFile("docs/QA_RUNBOOK.md");
  requireFile("docs/RC_CHECKLIST.md");
  requireFile("docs/RELEASE_NOTES_TEMPLATE.md");
  requireFile("AGENT_HANDOFF.md");
  requireText(
    "AGENT_HANDOFF.md",
    "## Current Project Phase",
    "current project phase",
  );
  requireText(
    "AGENT_HANDOFF.md",
    "Architecture complete enough",
    "architecture-complete phase statement",
  );
  requireText(
    "AGENT_HANDOFF.md",
    "The active roadmap starts at **PR #106**",
    "roadmap starts at PR #106",
  );
  requireText("AGENT_HANDOFF.md", "docs/QA_MATRIX.md", "QA matrix link");
  requireText(
    "AGENT_HANDOFF.md",
    "docs/RC_CHECKLIST.md",
    "RC checklist link",
  );
  requireText("docs/QA_MATRIX.md", "## Release Blockers", "release blockers");
  requireText("docs/QA_MATRIX.md", "Unknown", "unknown target states");
  requireText(
    "docs/RC_CHECKLIST.md",
    "Decision: pending.",
    "pending RC decision",
  );
  requireText(
    "docs/RC_CHECKLIST.md",
    "No new product features after the RC branch is cut.",
    "feature freeze rule",
  );
  requireText(
    "docs/RELEASE_NOTES_TEMPLATE.md",
    "## QA Evidence",
    "release notes QA evidence section",
  );

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
    "docs/DESKTOP_UPDATES.md",
    "docs/RC_CHECKLIST.md",
    "docs/RELEASE_NOTES_TEMPLATE.md",
  ];

  for (const relativePath of checkedDocs) {
    if (!exists(relativePath)) continue;
    const content = read(relativePath);
    if (releaseClaimPattern.test(content)) {
      fail(
        `${relativePath} appears to claim release-ready status; record RC evidence before making that claim`,
      );
    } else {
      pass(`${relativePath} has no explicit release-ready claim`);
    }

    if (/Status:\s*\*\*In review\.\*\*/i.test(content)) {
      fail(`${relativePath} contains stale in-review roadmap status`);
    } else {
      pass(`${relativePath} has no stale in-review roadmap status`);
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
  requireText(
    "packages/stream-server/src/security.ts",
    'process.env.NODE_ENV === "production"',
    "bridge auth distinguishes production from local development",
  );
  requireText(
    "packages/stream-server/src/security.ts",
    "BRIDGE_AUTH_NOT_CONFIGURED",
    "production bridge auth fails closed when token is missing",
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
  requireFile("scripts/rc-evidence.mjs");
  requireFile("scripts/rc-evidence.test.mjs");
  requireText(
    "scripts/rc-evidence.mjs",
    "failureBuckets",
    "RC evidence failure bucket taxonomy",
  );
  requireText(
    "scripts/rc-evidence.mjs",
    "rc-evidence.md",
    "RC evidence artifact path",
  );
  requireText(
    "docs/DESKTOP_UPDATES.md",
    "autoUpdater.autoDownload = false",
    "manual update download policy",
  );
  requireText(
    "docs/DESKTOP_UPDATES.md",
    "manual update notices only",
    "manual update strategy",
  );
  requirePattern(
    "apps/desktop/src/main.js",
    /autoUpdater\.autoDownload\s*=\s*false/,
    "desktop updates do not auto-download",
  );
  requirePattern(
    "apps/desktop/src/main.js",
    /autoUpdater\.autoInstallOnAppQuit\s*=\s*false/,
    "desktop updates do not auto-install on quit",
  );
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
