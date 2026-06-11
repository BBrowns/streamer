#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const args = new Set(process.argv.slice(2));
const dryRun =
  args.has("--dry-run") ||
  ["1", "true", "yes"].includes(
    String(process.env.SENTRY_RELEASE_DRY_RUN || "").toLowerCase(),
  );

const runtimeArtifacts = [
  {
    runtimeType: "server",
    sourcemapDir: "server/dist",
    urlPrefix: "~/server",
  },
  {
    runtimeType: "stream-server",
    sourcemapDir: "packages/stream-server/dist",
    urlPrefix: "~/stream-server",
  },
  {
    runtimeType: "desktop-main",
    sourcemapDir: "apps/desktop/dist",
    urlPrefix: "~/desktop-main",
  },
  {
    runtimeType: "desktop-renderer",
    sourcemapDir: "apps/mobile/dist",
    urlPrefix: "~/desktop-renderer",
  },
  {
    runtimeType: "mobile",
    sourcemapDir: "apps/mobile/dist",
    urlPrefix: "~/mobile",
  },
];

function firstValue(...values) {
  for (const value of values) {
    const cleaned = String(value ?? "").trim();
    if (cleaned) return cleaned;
  }
  return undefined;
}

function normalizeEnvironment(value) {
  const cleaned = String(value ?? "")
    .trim()
    .toLowerCase();
  if (cleaned === "production" || cleaned === "prod") return "production";
  if (cleaned === "preview" || cleaned === "staging" || cleaned === "stage") {
    return "preview";
  }
  if (cleaned === "test" || cleaned === "ci") return "test";
  return "development";
}

function shortSha(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned === "unknown") return "";
  return cleaned.slice(0, 12);
}

function getReleaseName(runtimeType) {
  const version =
    firstValue(
      process.env.STREAMER_APP_VERSION,
      process.env.EXPO_PUBLIC_STREAMER_APP_VERSION,
      process.env.npm_package_version,
    ) || "0.1.0";
  const sha = shortSha(
    firstValue(
      process.env.STREAMER_GIT_SHA,
      process.env.EXPO_PUBLIC_STREAMER_GIT_SHA,
      process.env.GITHUB_SHA,
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.EAS_BUILD_GIT_COMMIT_HASH,
    ),
  );
  return `streamer-${runtimeType}@${version}${sha ? `+${sha}` : ""}`;
}

function hasSourceMaps(absoluteDir) {
  if (!existsSync(absoluteDir)) return false;

  const entries = readdirSync(absoluteDir);
  for (const entry of entries) {
    const fullPath = join(absoluteDir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory() && hasSourceMaps(fullPath)) return true;
    if (stats.isFile() && entry.endsWith(".map")) return true;
  }
  return false;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function runSentryCli(commandArgs) {
  const command = process.env.SENTRY_CLI_COMMAND || "npx --yes @sentry/cli";
  const printable = `${command} ${commandArgs.map(shellQuote).join(" ")}`;
  if (dryRun) {
    console.log(`[dry-run] ${printable}`);
    return;
  }

  const result = spawnSync(
    `${command} ${commandArgs.map(shellQuote).join(" ")}`,
    {
      cwd: repoRoot,
      env: process.env,
      shell: true,
      stdio: "inherit",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function hasRequiredSentryEnv() {
  return Boolean(
    process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG &&
    process.env.SENTRY_PROJECT,
  );
}

const environment = normalizeEnvironment(
  firstValue(
    process.env.STREAMER_BUILD_ENVIRONMENT,
    process.env.EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT,
    process.env.SENTRY_ENVIRONMENT,
    process.env.NODE_ENV,
  ),
);

if (!dryRun && !hasRequiredSentryEnv()) {
  console.log(
    "Sentry release upload skipped: SENTRY_AUTH_TOKEN, SENTRY_ORG, or SENTRY_PROJECT is not configured.",
  );
  process.exit(0);
}

for (const artifact of runtimeArtifacts) {
  const release = getReleaseName(artifact.runtimeType);
  const absoluteDir = join(repoRoot, artifact.sourcemapDir);
  const relativeDir = relative(repoRoot, absoluteDir);
  const uploadMaps = hasSourceMaps(absoluteDir);

  console.log(
    `${dryRun ? "Validating" : "Publishing"} Sentry release ${release} (${artifact.runtimeType})`,
  );

  runSentryCli(["releases", "new", release]);
  runSentryCli([
    "releases",
    "set-commits",
    release,
    "--auto",
    "--ignore-missing",
  ]);

  if (uploadMaps) {
    runSentryCli([
      "releases",
      "files",
      release,
      "upload-sourcemaps",
      relativeDir,
      "--rewrite",
      "--validate",
      "--url-prefix",
      artifact.urlPrefix,
    ]);
  } else {
    console.log(
      `No source maps found for ${artifact.runtimeType} in ${relativeDir}; skipping source-map upload.`,
    );
  }

  runSentryCli(["releases", "finalize", release]);
  runSentryCli(["releases", "deploys", release, "new", "-e", environment]);
}
