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
    ["npm run mobile:config:check", "mobile release config validation"],
    ["npm run test --workspace=@streamer/shared", "shared tests"],
    ["npm run test --workspace=server -- --coverage", "server coverage tests"],
    ["npm run test --workspace=@streamer/stream-server", "stream-server tests"],
    [
      "npm run test --workspace=apps/mobile -- --runInBand",
      "mobile Jest tests",
    ],
    ["npm run test:golden-path", "deterministic browser golden paths"],
    ["npm run package:check --workspace=@streamer/desktop", "desktop smoke"],
    [
      "npm run release:check --workspace=@streamer/desktop",
      "desktop release config smoke",
    ],
    ["npm run sentry:release:dry-run", "Sentry release dry-run"],
    ["security:install-scripts", "dependency install-script policy"],
    ["security:audit", "production dependency audit"],
    ["npm run rc:evidence:test", "RC evidence generator test"],
    ["npm run rc:evidence", "RC evidence generation"],
    ["smoke-server-container.sh", "server production container smoke"],
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
  requireFile("ROADMAP.md");
  requireFile("docs/DEPENDENCY_SECURITY.md");
  requireFile("docs/AUTOMATED_GOLDEN_PATHS.md");
  requireFile("docs/MOBILE_RELEASE.md");
  requireFile("docs/SERVER_PRODUCTION.md");
  requireFile("playwright.config.ts");
  requireFile("tests/golden-path/golden-path.spec.ts");
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
    "The active implementation roadmap continues at **PR #149**",
    "implementation roadmap continues at PR #149",
  );
  requireText("AGENT_HANDOFF.md", "ROADMAP.md", "active roadmap link");
  requireText("AGENT_HANDOFF.md", "docs/QA_MATRIX.md", "QA matrix link");
  requireText("AGENT_HANDOFF.md", "docs/RC_CHECKLIST.md", "RC checklist link");
  requireText(
    "AGENT_HANDOFF.md",
    "docs/DEPENDENCY_SECURITY.md",
    "dependency security baseline link",
  );
  requireText(
    "AGENT_HANDOFF.md",
    "docs/AUTOMATED_GOLDEN_PATHS.md",
    "automated golden-path documentation link",
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

function checkMobileReleaseConfig() {
  requireFile("apps/mobile/app.config.js");
  requireFile("apps/mobile/config/mobileAppConfig.js");
  requireFile("apps/mobile/eas.json");
  requireFile("scripts/validate-mobile-config.mjs");
  requireText("apps/mobile/app.json", '"slug": "streamer"', "stable Expo slug");
  requireText(
    "apps/mobile/app.json",
    '"bundleIdentifier": "com.bbrowns.streamer"',
    "stable iOS bundle identifier",
  );
  requireText(
    "apps/mobile/app.json",
    '"package": "com.bbrowns.streamer"',
    "stable Android package identifier",
  );
  requireText(
    "apps/mobile/eas.json",
    '"appVersionSource": "remote"',
    "remote app version source",
  );
  for (const profile of ["development", "preview", "production"]) {
    requireText(
      "apps/mobile/eas.json",
      `"environment": "${profile}"`,
      `${profile} EAS environment`,
    );
    requireText(
      "apps/mobile/eas.json",
      `"channel": "${profile}"`,
      `${profile} update channel`,
    );
  }
}

function checkDependencySecurity() {
  requireFile(".nvmrc");
  requireFile("patches/castv2+0.1.10.patch");
  requireFile("scripts/check-install-script-policy.mjs");
  requireText(".nvmrc", "24.18.0", "supported Node LTS version");
  requireText(
    "package.json",
    '"node": ">=24.18.0 <25"',
    "Node 24 LTS engine boundary",
  );
  requireText(
    "package.json",
    '"packageManager": "npm@11.18.0"',
    "pinned npm version",
  );
  requireText(
    "package.json",
    '"security:audit": "npm audit --omit=dev --audit-level=high"',
    "blocking production high/critical audit",
  );
  requireText(
    "package.json",
    '"security:install-scripts": "node scripts/check-install-script-policy.mjs"',
    "install-script policy command",
  );
  requireText(
    "docs/DEPENDENCY_SECURITY.md",
    "Reviewed Transitive Findings",
    "reviewed dependency exceptions",
  );
  requireText(
    "docs/DEPENDENCY_SECURITY.md",
    "2026-09-30",
    "dependency exception review deadline",
  );
  requireText(
    "server/package.json",
    '"pretest": "prisma generate"',
    "Prisma generation before server tests",
  );
  requireText(
    "server/package.json",
    '"prebuild": "prisma generate"',
    "Prisma generation before server builds",
  );
  requireText(
    "package.json",
    '"typecheck:all": "npm run db:generate --workspace=server && turbo run typecheck"',
    "Prisma generation before parallel workspace typechecks",
  );
}

function checkProductionDefaults() {
  requirePattern(
    "server/src/config/env.validation.ts",
    /STREAMER_BRIDGE_SUPERVISOR:\s*z\.string\(\)\.default\("false"\)/,
    "bridge supervisor disabled by default",
  );
  requirePattern(
    "server/src/config/env.validation.ts",
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
  requireText(
    "server/src/config/env.validation.ts",
    "SERVER_INSTANCE_MODE must be explicitly set",
    "explicit production instance topology",
  );
  requireText(
    "server/src/config/env.validation.ts",
    "REDIS_URL is required for multi-instance production deployments",
    "multi-instance Redis requirement",
  );
  requireText(
    "server/src/app.ts",
    'app.use("/api/*", rateLimiter)',
    "global API rate limiter",
  );
  requireText(
    "server/src/modules/system/system.routes.ts",
    'path: "/live"',
    "server liveness endpoint",
  );
  requireText(
    "server/src/modules/system/system.routes.ts",
    'path: "/ready"',
    "server readiness endpoint",
  );
  requireText("server/Dockerfile", "/live", "container liveness probe");
  for (const testFile of [
    "server/tests/env.validation.test.ts",
    "server/tests/readiness.test.ts",
    "server/tests/rate-limiter.test.ts",
  ]) {
    requireFile(testFile);
  }
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
checkDependencySecurity();
checkMobileReleaseConfig();
writeSummary();

if (failures.length > 0) {
  process.exit(1);
}
