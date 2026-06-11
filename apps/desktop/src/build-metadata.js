"use strict";

const UNKNOWN = "unknown";

function clean(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function normalizeEnvironment(environment, nodeEnv) {
  const value = clean(environment)?.toLowerCase();

  if (value === "production" || value === "prod") return "production";
  if (value === "preview" || value === "staging" || value === "stage") {
    return "preview";
  }
  if (value === "test" || value === "ci") return "test";
  if (value === "development" || value === "dev" || value === "local") {
    return "development";
  }

  const fallback = clean(nodeEnv)?.toLowerCase();
  if (fallback === "production") return "production";
  if (fallback === "test") return "test";
  return "development";
}

function normalizeGitSha(gitSha) {
  const cleaned = clean(gitSha);
  if (!cleaned || cleaned === UNKNOWN) {
    return { gitSha: UNKNOWN, gitShaShort: UNKNOWN };
  }

  return {
    gitSha: cleaned,
    gitShaShort: cleaned.slice(0, 12),
  };
}

function normalizeBuildDate(buildDate) {
  const cleaned = clean(buildDate);
  if (!cleaned) return UNKNOWN;

  if (/^\d+$/.test(cleaned)) {
    const date = new Date(Number(cleaned) * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return cleaned;
}

function createReleaseName(metadata) {
  const shaSuffix =
    metadata.gitShaShort && metadata.gitShaShort !== UNKNOWN
      ? `+${metadata.gitShaShort}`
      : "";
  return `streamer-${metadata.runtimeType}@${metadata.appVersion}${shaSuffix}`;
}

function createDesktopBuildMetadata(env = process.env, options = {}) {
  const environment = normalizeEnvironment(
    firstValue(
      env.STREAMER_BUILD_ENVIRONMENT,
      env.SENTRY_ENVIRONMENT,
      env.NODE_ENV,
    ),
    env.NODE_ENV,
  );
  const appVersion =
    firstValue(
      env.STREAMER_APP_VERSION,
      options.appVersion,
      env.npm_package_version,
    ) || UNKNOWN;
  const { gitSha, gitShaShort } = normalizeGitSha(
    firstValue(env.STREAMER_GIT_SHA, env.GITHUB_SHA, env.VERCEL_GIT_COMMIT_SHA),
  );
  const buildChannel =
    firstValue(
      env.STREAMER_BUILD_CHANNEL,
      env.APP_ENV,
      env.NODE_ENV,
      environment,
    ) || environment;

  const metadata = {
    appVersion,
    gitSha,
    gitShaShort,
    buildDate: normalizeBuildDate(
      firstValue(
        env.STREAMER_BUILD_DATE,
        env.BUILD_DATE,
        env.SOURCE_DATE_EPOCH,
      ),
    ),
    buildChannel,
    runtimeType: "desktop-main",
    environment,
    release: "",
  };
  metadata.release = createReleaseName(metadata);
  return metadata;
}

function buildMetadataToSentryTags(metadata) {
  return {
    "streamer.runtime": metadata.runtimeType,
    "streamer.version": metadata.appVersion,
    "streamer.git_sha": metadata.gitSha,
    "streamer.git_sha_short": metadata.gitShaShort,
    "streamer.build_date": metadata.buildDate,
    "streamer.build_channel": metadata.buildChannel,
  };
}

module.exports = {
  buildMetadataToSentryTags,
  createDesktopBuildMetadata,
};
