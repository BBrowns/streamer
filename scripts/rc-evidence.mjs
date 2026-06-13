#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const DEFAULT_OUTPUT = "artifacts/rc-evidence/rc-evidence.md";

export const failureBuckets = [
  "no_peers",
  "timeout",
  "bridge_unavailable",
  "unsupported_codec",
  "remux_unavailable",
  "cast_unreachable",
  "download_verification_failed",
  "security_policy_blocked",
];

const requiredCiJobs = [
  "Format Check",
  "Lint & Type Check",
  "Security Audit",
  "Shared Tests",
  "Server Tests",
  "Stream Server Tests",
  "Mobile Tests",
  "Build Check",
  "Desktop Package Artifact",
  "Release Gate",
];

function firstValue(...values) {
  for (const value of values) {
    const cleaned = String(value ?? "").trim();
    if (cleaned) return cleaned;
  }
  return "unknown";
}

function readDocSummary(relativePath, fallback) {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return fallback;

  const content = readFileSync(absolutePath, "utf8");
  const firstNonEmptyLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  return firstNonEmptyLine || fallback;
}

export function createRcEvidence(input = {}) {
  const env = input.env ?? process.env;
  const now = input.now ?? new Date();
  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : "local";
  const gitSha = firstValue(env.STREAMER_GIT_SHA, env.GITHUB_SHA);
  const buildDate = firstValue(env.STREAMER_BUILD_DATE, now.toISOString());
  const buildChannel = firstValue(env.STREAMER_BUILD_CHANNEL, "local");
  const buildEnvironment = firstValue(
    env.STREAMER_BUILD_ENVIRONMENT,
    env.NODE_ENV,
    "development",
  );
  const appVersion = firstValue(
    env.STREAMER_APP_VERSION,
    env.npm_package_version,
    "0.1.0",
  );

  return `# RC Evidence Bundle

Generated: ${now.toISOString()}

This bundle summarizes automated release-candidate evidence. It is not a
release-ready claim; manual QA evidence and go/no-go approval still need to be
recorded in the QA matrix before release.

## Build

| Field | Value |
| --- | --- |
| Version | ${appVersion} |
| Git SHA | ${gitSha} |
| Build date | ${buildDate} |
| Channel | ${buildChannel} |
| Environment | ${buildEnvironment} |
| CI run | ${runUrl} |

## Required CI Jobs

${requiredCiJobs.map((job) => `- ${job}: confirm passed in CI summary artifacts`).join("\n")}

## Observability

- Sentry release dry-run is validated by CI build checks.
- Sentry source-map upload runs on pushes to \`master\` or \`main\` when secrets are configured.
- Breadcrumb policy: ${readDocSummary(
    "docs/SENTRY_RELEASES.md",
    "privacy-safe playback, gateway, download, and cast breadcrumbs",
  )}
- Forbidden telemetry data remains documented in [docs/SENTRY_RELEASES.md](../../docs/SENTRY_RELEASES.md).

## Failure Buckets

${failureBuckets.map((bucket) => `- ${bucket}`).join("\n")}

## QA Evidence Links

- QA matrix: [docs/QA_MATRIX.md](../../docs/QA_MATRIX.md)
- QA runbook: [docs/QA_RUNBOOK.md](../../docs/QA_RUNBOOK.md)
- RC checklist: [docs/RC_CHECKLIST.md](../../docs/RC_CHECKLIST.md)
- Dated QA runs: [docs/qa-runs/](../../docs/qa-runs/)

## Release Blockers To Check

- Required target QA runs have dated evidence.
- Known issues have severity, runtime, workaround, and go/no-go recommendation.
- Desktop package artifact is downloadable from CI.
- Sentry release/source-map workflow is configured or safely skipped.
- No raw media URLs, magnets, tokens, info hashes, or sensitive local paths are present in logs, Sentry events, or debug bundles.
`;
}

function parseOutputPath(argv) {
  const outputIndex = argv.indexOf("--output");
  if (outputIndex >= 0 && argv[outputIndex + 1]) return argv[outputIndex + 1];
  return DEFAULT_OUTPUT;
}

export function writeRcEvidence(outputPath = DEFAULT_OUTPUT, input = {}) {
  const relativeOutput = outputPath.startsWith("/")
    ? relative(repoRoot, outputPath)
    : outputPath;
  const absoluteOutput = outputPath.startsWith("/")
    ? outputPath
    : join(repoRoot, outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  const content = createRcEvidence(input);
  writeFileSync(absoluteOutput, content);
  return { absoluteOutput, relativeOutput, content };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = writeRcEvidence(parseOutputPath(process.argv.slice(2)));
  console.log(`Wrote ${result.relativeOutput}`);
}
