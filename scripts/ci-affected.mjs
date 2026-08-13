#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ciJobNames = Object.freeze([
  "lint",
  "format",
  "security",
  "shared",
  "server",
  "stream_server",
  "mobile",
  "golden_path",
  "visual",
  "build",
  "server_container",
  "desktop_package",
]);

const allJobs = () =>
  Object.fromEntries(ciJobNames.map((name) => [`run_${name}`, true]));

const draftJobs = () => {
  const jobs = Object.fromEntries(
    ciJobNames.map((name) => [`run_${name}`, false]),
  );
  jobs.run_lint = true;
  jobs.run_format = true;
  jobs.run_security = true;
  return jobs;
};

const fullCiPathPatterns = [
  /^\.github\//,
  /^\.nvmrc$/,
  /^\.prettier(ignore|rc.*)?$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^patches\//,
  /^scripts\//,
  /^packages\/shared\//,
  /^server\/package\.json$/,
  /^packages\/[^/]+\/package\.json$/,
  /^apps\/[^/]+\/package\.json$/,
  /^apps\/mobile\/(app\.json|app\.config\.(js|ts)|eas\.json)$/,
  /^apps\/desktop\/.*(electron|native|release|vendor)/,
  /(^|\/)native(\/|[-_.])/i,
  /(^|\/)electron(\/|[-_.])/i,
  /(^|\/)(ios|android)(\/|[-_.])/i,
  /(^|\/)(auth|bridge|security)(\/|[-_.])/i,
  /^turbo\.json$/,
  /^tsconfig(\..*)?\.json$/,
  /^Dockerfile$/,
  /^server\/Dockerfile$/,
];

const knownPathPatterns = [
  /^README\.md$/,
  /^AGENT_HANDOFF\.md$/,
  /^ROADMAP\.md$/,
  /^CHANGELOG\.md$/,
  /^docs\//,
  /^apps\/mobile\//,
  /^apps\/desktop\//,
  /^packages\/stream-server\//,
  /^packages\/shared\//,
  /^server\//,
  /^tests\/golden-path\//,
  /^playwright\.config\.ts$/,
  /^\.github\//,
  /^\.nvmrc$/,
  /^\.prettierignore$/,
  /^\.prettierrc(\..*)?$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^patches\//,
  /^scripts\//,
  /^turbo\.json$/,
  /^tsconfig(\..*)?\.json$/,
  /^Dockerfile$/,
  /^server\/Dockerfile$/,
];

const formatPathPattern = /\.(cjs|js|json|md|mjs|ts|tsx|yaml|yml)$/i;

function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path));
}

function isKnownPath(path) {
  return matchesAny(path, knownPathPatterns);
}

function isFullCiPath(path) {
  return matchesAny(path, fullCiPathPatterns);
}

function isPathIn(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function createScopedJobs(paths) {
  const jobs = Object.fromEntries(
    ciJobNames.map((name) => [`run_${name}`, false]),
  );

  jobs.run_lint = paths.some(
    (path) =>
      isPathIn(path, "apps") ||
      isPathIn(path, "packages") ||
      isPathIn(path, "server") ||
      isPathIn(path, "tests") ||
      path === "playwright.config.ts",
  );
  jobs.run_format = paths.some((path) => formatPathPattern.test(path));

  jobs.run_shared = paths.some((path) => isPathIn(path, "packages/shared"));
  jobs.run_server = paths.some((path) => isPathIn(path, "server"));
  jobs.run_stream_server = paths.some((path) =>
    isPathIn(path, "packages/stream-server"),
  );
  jobs.run_mobile = paths.some((path) => isPathIn(path, "apps/mobile"));
  jobs.run_golden_path = paths.some(
    (path) =>
      isPathIn(path, "apps/mobile") ||
      isPathIn(path, "tests/golden-path") ||
      path === "playwright.config.ts",
  );
  jobs.run_visual = paths.some(
    (path) =>
      isPathIn(path, "apps/mobile") ||
      isPathIn(path, "tests/golden-path") ||
      path === "playwright.config.ts",
  );
  jobs.run_build = paths.some(
    (path) =>
      isPathIn(path, "apps") ||
      isPathIn(path, "packages") ||
      isPathIn(path, "server"),
  );
  jobs.run_server_container = paths.some(
    (path) => isPathIn(path, "server") || path === "Dockerfile",
  );
  jobs.run_desktop_package = paths.some(
    (path) =>
      isPathIn(path, "apps/desktop") ||
      isPathIn(path, "packages/stream-server"),
  );
  jobs.run_security = paths.some(
    (path) =>
      path.startsWith("docs/DEPENDENCY_SECURITY") ||
      path.startsWith("docs/SECURITY") ||
      path.startsWith(".github/"),
  );

  return jobs;
}

export function analyzeChanges({
  eventName,
  baseSha,
  headSha,
  changedFiles,
  isDraft = false,
}) {
  if (eventName !== "pull_request") {
    return {
      full_ci: true,
      scope_reason: `event:${eventName || "unknown"}`,
      changed_file_count: 0,
      ...allJobs(),
    };
  }

  if (!baseSha || !headSha) {
    return {
      full_ci: true,
      scope_reason: "missing-pr-base-or-head",
      changed_file_count: 0,
      ...allJobs(),
    };
  }

  const paths = [...new Set((changedFiles ?? []).map(normalizePath))].sort();
  if (paths.length === 0) {
    return {
      full_ci: true,
      scope_reason: "no-changed-files",
      changed_file_count: 0,
      ...allJobs(),
    };
  }

  if (isDraft) {
    return {
      full_ci: false,
      scope_reason: "draft-pull-request",
      changed_file_count: paths.length,
      ...draftJobs(),
    };
  }

  const unknownPath = paths.find((path) => !isKnownPath(path));
  const fullPath = paths.find((path) => isFullCiPath(path));
  if (unknownPath || fullPath) {
    return {
      full_ci: true,
      scope_reason: unknownPath ? "unknown-path" : "full-ci-path",
      changed_file_count: paths.length,
      ...allJobs(),
    };
  }

  return {
    full_ci: false,
    scope_reason: "affected-paths",
    changed_file_count: paths.length,
    ...createScopedJobs(paths),
  };
}

function readChangedFiles(baseSha, headSha) {
  try {
    return execFileSync(
      "git",
      ["diff", "--name-only", "-z", "--diff-filter=ACMRD", baseSha, headSha],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    )
      .split("\0")
      .filter((path) => path.length > 0);
  } catch (error) {
    throw new Error(
      `Unable to determine changed files between ${baseSha} and ${headSha}: ${error.message}`,
    );
  }
}

export function writeGitHubOutputs(outputs, outputPath) {
  if (!outputPath) return;
  const lines = Object.entries(outputs).map(
    ([key, value]) => `${key}=${value}`,
  );
  appendFileSync(outputPath, `${lines.join("\n")}\n`);
}

function writeSummary(outputs, summaryPath) {
  if (!summaryPath) return;
  appendFileSync(
    summaryPath,
    [
      "## CI scope",
      "",
      `- Mode: ${outputs.scope_reason === "draft-pull-request" ? "draft fast CI" : outputs.full_ci ? "full CI" : "affected CI"}`,
      `- Reason: \`${outputs.scope_reason}\``,
      `- Changed files considered: ${outputs.changed_file_count}`,
      "- Selected jobs: " +
        ciJobNames
          .filter((name) => outputs[`run_${name}`])
          .map((name) => `\`${name}\``)
          .join(", "),
      "",
    ].join("\n"),
  );
}

function main() {
  const eventName = process.env.CI_EVENT_NAME ?? process.env.GITHUB_EVENT_NAME;
  const baseSha = process.env.CI_BASE_SHA;
  const headSha = process.env.CI_HEAD_SHA ?? process.env.GITHUB_SHA;
  const isDraft = process.env.CI_IS_DRAFT === "true";
  const changedFiles =
    eventName === "pull_request" && baseSha && headSha
      ? readChangedFiles(baseSha, headSha)
      : undefined;
  const outputs = analyzeChanges({
    eventName,
    baseSha,
    headSha,
    changedFiles,
    isDraft,
  });

  writeGitHubOutputs(outputs, process.env.GITHUB_OUTPUT);
  writeSummary(outputs, process.env.GITHUB_STEP_SUMMARY);
  console.log(JSON.stringify(outputs, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
