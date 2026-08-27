#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgentHandoff } from "./validate-process-assets.mjs";
import { visualBaselineFileNames } from "./visual-baseline-manifest.mjs";

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
  requireFile("scripts/ci-affected.mjs");
  requireFile("scripts/ci-affected.test.mjs");
  requireFile("scripts/ci-needs-check.mjs");
  requireFile("scripts/ci-needs-check.test.mjs");

  const requiredSnippets = [
    ["ci_scope:", "fail-closed CI scope detector"],
    ["CI_BASE_SHA", "pull-request base SHA for affected CI"],
    ["fetch-depth: 0", "complete history for affected CI"],
    [
      'git show "${CI_BASE_SHA}:scripts/ci-affected.mjs"',
      "trusted base-version scope detector",
    ],
    ["npm run format:check", "format check"],
    ["npm run typecheck:all", "all-workspace typecheck"],
    [
      "npm run native:evidence:preflight:test",
      "native evidence preflight contract",
    ],
    [
      "npm run visual:baseline:manifest:test",
      "visual baseline artifact contract",
    ],
    ["npm run mobile:config:check", "mobile release config validation"],
    ["npm run test --workspace=@streamer/shared", "shared tests"],
    ["npm run test --workspace=server -- --coverage", "server coverage tests"],
    ["npm run test --workspace=@streamer/stream-server", "stream-server tests"],
    [
      "npm run test --workspace=apps/mobile -- --runInBand",
      "mobile Jest tests",
    ],
    [
      "npm run test:golden-path:project",
      "deterministic browser golden paths per project",
    ],
    [
      "golden-path-browser-report-${{ matrix.project }}",
      "per-project browser evidence artifact",
    ],
    ["golden_path_gate:", "stable browser required-check aggregator"],
    ["visual-regression:", "committed Linux visual regression gate"],
    [
      "visual-regression-linux-report",
      "committed visual comparison evidence artifact",
    ],
    ["npm run package:check --workspace=@streamer/desktop", "desktop smoke"],
    [
      "npm run release:check --workspace=@streamer/desktop",
      "desktop release config smoke",
    ],
    ["npm run sentry:release:dry-run", "Sentry release dry-run"],
    [
      "node scripts/ci-install.mjs",
      "lifecycle-safe reproducible dependency install",
    ],
    ["security:install-scripts", "dependency install-script policy"],
    [
      "npm run db:migrate:deploy",
      "committed Prisma migration deployment",
    ],
    ["--schema=prisma/schema.prisma", "workspace-relative Prisma schema path"],
    ["security:audit", "production dependency audit"],
    ["npm run process:check", "agent process asset validation"],
    ["npm run process:check:test", "agent process validator tests"],
    [
      "npm run architecture:check",
      "architecture boundary and budget validation",
    ],
    ["npm run architecture:budget:test", "architecture budget validator tests"],
    ["npm run maintenance:report:test", "maintenance report classifier tests"],
    ["actionlint@v1.7.12", "pinned GitHub Actions lint"],
    ["npm run workflows:check", "full GitHub Actions SHA policy"],
    [
      "node --test scripts/ci-affected.test.mjs",
      "affected CI scope detector tests",
    ],
    [
      "node --test scripts/ci-needs-check.test.mjs",
      "release gate skip policy tests",
    ],
    ["merge_group:", "merge queue CI trigger"],
    ["npm run rc:evidence:test", "RC evidence generator test"],
    ["npm run rc:evidence", "RC evidence generation"],
    ["npm run release:sbom:test", "lockfile SBOM generator test"],
    ["smoke-server-container.sh", "server production container smoke"],
    ["npm run release:gate", "release gate"],
    ["ci-summaries", "test summary artifacts"],
    ["rc-evidence-bundle", "RC evidence artifact"],
    ["apps/desktop/release", "desktop package artifact"],
    ["actions/upload-artifact@", "artifact upload"],
  ];

  for (const [needle, label] of requiredSnippets) {
    requireText(workflow, needle, label);
  }

  const releaseWorkflow = ".github/workflows/release-desktop.yml";
  requireFile(releaseWorkflow);
  for (const [needle, label] of [
    ["validate-dispatch:", "unprivileged release dispatch preflight"],
    ["needs: validate-dispatch", "release preflight dependency"],
    [
      "dispatch_sha: ${{ steps.validate.outputs.dispatch_sha }}",
      "immutable release dispatch output",
    ],
    [
      "ref: ${{ needs.validate-dispatch.outputs.dispatch_sha }}",
      "immutable release source checkout",
    ],
    ["git rev-parse HEAD", "protected source revision stamp"],
    [
      "npm run package:mac:release --workspace=@streamer/desktop",
      "macOS release package command",
    ],
    ["STREAMER_NOTARIZE", "notarization gate"],
    [
      "Validate release ref, tag, and channel policy",
      "release ref and channel policy",
    ],
    ["environment:", "release environment protection"],
    ["timeout-minutes: 60", "release job timeout"],
    ["softprops/action-gh-release", "GitHub Release draft action"],
    ["actions/upload-artifact@", "release artifact upload"],
    ["actions/attest@", "release provenance attestation"],
    [
      "npm run release:sbom -- --output artifacts/release/sbom.spdx.json",
      "lockfile SBOM generation",
    ],
    ["artifacts/release/sbom.spdx.json", "lockfile SBOM release artifact"],
  ]) {
    requireText(releaseWorkflow, needle, label);
  }
  for (const [action, label] of [
    ["actions/checkout", "release checkout action pinned to a commit"],
    ["actions/setup-node", "release Node setup action pinned to a commit"],
    ["actions/attest", "release attestation action pinned to a commit"],
    [
      "actions/upload-artifact",
      "release artifact upload action pinned to a commit",
    ],
    ["softprops/action-gh-release", "GitHub Release action pinned to a commit"],
  ]) {
    requirePattern(
      releaseWorkflow,
      new RegExp(`uses:\\s*${action.replace("/", "\\/")}@[0-9a-f]{40}\\b`),
      label,
    );
  }
  requireText(
    ".github/workflows/ci.yml",
    "Verify required CI jobs succeeded",
    "release gate upstream result verification",
  );

  const dependencyReviewWorkflow = ".github/workflows/dependency-review.yml";
  requireFile(dependencyReviewWorkflow);
  const dependabotWorkflow = ".github/workflows/dependabot-auto-merge.yml";
  requireFile(dependabotWorkflow);
  requireText(
    dependabotWorkflow,
    "pull_request_target:",
    "Dependabot metadata-only trigger",
  );
  requireText(
    dependabotWorkflow,
    "dependabot/fetch-metadata@",
    "Dependabot metadata action",
  );
  requireText(
    dependabotWorkflow,
    "--auto --squash",
    "protected auto-merge request",
  );
  requireText(
    dependabotWorkflow,
    "always() && steps.policy.outputs.eligible != 'true'",
    "stale auto-merge fail-closed cleanup",
  );
  if (exists(dependabotWorkflow) && /continue-on-error:\s*true/.test(read(dependabotWorkflow))) {
    fail(`${dependabotWorkflow} must not hide stale auto-merge cleanup failures`);
  } else {
    pass(`${dependabotWorkflow} surfaces stale auto-merge cleanup failures`);
  }
  requireFile(".github/workflows/maintenance-radar.yml");
  requireText(
    dependencyReviewWorkflow,
    "actions/dependency-review-action@",
    "dependency review action",
  );
  requireText(
    dependencyReviewWorkflow,
    "fail-on-severity: high",
    "high-severity dependency gate",
  );
  requireText(
    dependencyReviewWorkflow,
    "merge_group:",
    "merge queue dependency review trigger",
  );
  requireText(
    dependencyReviewWorkflow,
    "base-ref:",
    "merge queue dependency review base reference",
  );
  requireText(
    dependencyReviewWorkflow,
    "head-ref:",
    "merge queue dependency review head reference",
  );
  requirePattern(
    dependencyReviewWorkflow,
    /uses:\s*actions\/dependency-review-action@[0-9a-f]{40}\b/,
    "dependency review action pinned to a commit",
  );
}

function checkDocs() {
  requireFile("docs/QA_MATRIX.md");
  requireFile("docs/QA_RUNBOOK.md");
  requireFile("docs/RC_CHECKLIST.md");
  requireFile("docs/RELEASE_NOTES_TEMPLATE.md");
  requireFile("AGENT_HANDOFF.md");
  requireFile("ROADMAP.md");
  requireFile("docs/DEPENDENCY_SECURITY.md");
  requireFile("docs/ARCHITECTURE_MAINTENANCE.md");
  requireText(
    "docs/DEPENDENCY_SECURITY.md",
    "secret scanning and push protection",
    "secret scanning and push protection policy",
  );
  requireFile("docs/AUTOMATED_GOLDEN_PATHS.md");
  requireFile("docs/MOBILE_RELEASE.md");
  requireFile("docs/SERVER_PRODUCTION.md");
  requireText(
    "docs/MACOS_RELEASE.md",
    "gh attestation verify",
    "desktop provenance verification",
  );
  requireText(
    "docs/MACOS_RELEASE.md",
    "npm run release:sbom",
    "production SBOM generation",
  );
  requireFile("playwright.config.ts");
  requireFile("tests/golden-path/golden-path.spec.ts");
  requireFile("tests/golden-path/visual-regression.spec.ts");
  requireFile("scripts/native-evidence-preflight.mjs");
  requireFile("scripts/visual-baseline-manifest.mjs");
  for (const baselineFile of visualBaselineFileNames) {
    requireFile(
      `tests/golden-path/visual-regression.spec.ts-snapshots/linux/${baselineFile}`,
    );
  }
  const handoffErrors = validateAgentHandoff(repoRoot);
  if (handoffErrors.length === 0) {
    pass("AGENT_HANDOFF.md meets the compact current-context contract");
  } else {
    for (const error of handoffErrors) fail(error);
  }
  requireText(
    "package.json",
    '"native:evidence:preflight": "node scripts/native-evidence-preflight.mjs"',
    "native evidence preflight command",
  );
  requireText(
    "package.json",
    '"visual:baseline:manifest": "node scripts/visual-baseline-manifest.mjs"',
    "visual baseline manifest command",
  );
  requireText(
    "package.json",
    '"test:golden-path:project": "playwright test --config=playwright.config.ts"',
    "per-project golden-path command",
  );
  requireText(
    "package.json",
    '"test:golden-path": "playwright test --config=playwright.config.ts --project=phone-web --project=tablet-portrait-web --project=tablet-landscape-web --project=desktop-renderer"',
    "full local golden-path command",
  );
  requireText(
    "scripts/ci-affected.mjs",
    "missing-pr-base-or-head",
    "fail-closed affected CI fallback",
  );
  requireText(
    ".github/workflows/ci.yml",
    'git show "${CI_BASE_SHA}:scripts/ci-needs-check.mjs"',
    "trusted release gate selected-job verification",
  );
  requireText(
    "docs/AUTOMATED_GOLDEN_PATHS.md",
    "## Versioned Visual Baselines",
    "versioned visual baseline documentation",
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
    "Production SBOM",
    "production SBOM release input",
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

function checkDesktopBuildMetadataValidation() {
  requireText(
    "apps/desktop/scripts/validate-release-config.cjs",
    "STREAMER_APP_VERSION",
    "desktop product-version release stamp validation",
  );
  requireText(
    "apps/desktop/scripts/validate-release-config.cjs",
    "STREAMER_GIT_SHA",
    "desktop Git SHA release stamp validation",
  );
  requireText(
    "apps/desktop/scripts/validate-release-config.cjs",
    "STREAMER_BUILD_CHANNEL",
    "desktop build-channel release stamp validation",
  );
  requireText(
    "apps/desktop/package.json",
    "--require-build-metadata",
    "release packaging metadata gate",
  );
}

function checkDependencySecurity() {
  requireFile(".nvmrc");
  requireFile(".github/CODEOWNERS");
  requireFile("server/prisma/migrations/migration_lock.toml");
  requireFile("server/prisma/migrations/20260101000000_init/migration.sql");
  requireFile("server/prisma/migrations/20260727154500_add_watch_progress_duration_source/migration.sql");
  requireFile("server/prisma/migrations/20260814213000_add_watch_progress_background/migration.sql");
  requireText(
    "server/package.json",
    '"db:migrate:deploy": "prisma migrate deploy"',
    "Prisma migration deployment command",
  );
  requireText(
    "server/prisma/migrations/20260101000000_init/migration.sql",
    'CREATE TABLE "users"',
    "initial Prisma migration baseline",
  );
  requireText(
    "server/prisma/migrations/20260727154500_add_watch_progress_duration_source/migration.sql",
    'ADD COLUMN "duration_source"',
    "strict duration-source migration",
  );
  requireText(
    "server/prisma/migrations/20260814213000_add_watch_progress_background/migration.sql",
    'ADD COLUMN "background"',
    "strict background migration",
  );
  for (const testFile of [
    "server/tests/aggregator-resilience.test.ts",
    "server/tests/api.integration.test.ts",
    "server/tests/e2e-golden-path.test.ts",
    "server/tests/library.integration.test.ts",
    "server/tests/search-addon.integration.test.ts",
    "server/tests/trakt.integration.test.ts",
  ]) {
    if (exists(testFile) && /prisma\s+db\s+push/.test(read(testFile))) {
      fail(`${testFile} must use committed migrations instead of prisma db push`);
    } else {
      pass(`${testFile} uses committed migrations for integration setup`);
    }
  }
  requireText(
    ".github/CODEOWNERS",
    "package-lock.json",
    "dependency lockfile ownership",
  );
  requireFile("patches/castv2+0.1.10.patch");
  requireFile("scripts/check-install-script-policy.mjs");
  try {
    const packageJson = JSON.parse(read("package.json"));
    const nodeMatch = /^>=(\d+\.\d+\.\d+)\s+<(\d+)$/.exec(
      packageJson.engines?.node ?? "",
    );
    const npmMatch = /^>=(\d+\.\d+\.\d+)\s+<(\d+)$/.exec(
      packageJson.engines?.npm ?? "",
    );
    const managerMatch = /^npm@(\d+\.\d+\.\d+)$/.exec(
      packageJson.packageManager ?? "",
    );
    if (!nodeMatch || !npmMatch || !managerMatch) {
      fail("package.json must define bounded Node/npm engines and pinned npm");
    } else if (npmMatch[1] !== managerMatch[1]) {
      fail("packageManager must match the minimum npm engine version");
    } else if (read(".nvmrc").trim() !== nodeMatch[1]) {
      fail(".nvmrc must match the minimum Node engine version");
    } else {
      pass("package.json is the synchronized Node/npm policy source");
    }
  } catch (error) {
    fail(`toolchain policy could not be parsed: ${error.message || error}`);
  }
  requireText(
    "package.json",
    '"security:audit": "node scripts/security-audit.mjs"',
    "blocking production high/critical audit",
  );
  requireFile("scripts/security-audit.mjs");
  requireText(
    "scripts/security-audit.mjs",
    "GHSA-MH99-V99M-4GVG",
    "reviewed brace-expansion advisory exception",
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
    '"pretest:integration": "prisma generate"',
    "Prisma generation before server integration tests",
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
checkDesktopBuildMetadataValidation();
writeSummary();

if (failures.length > 0) {
  process.exit(1);
}
