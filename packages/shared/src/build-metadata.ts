import type {
  BuildEnvSource,
  BuildEnvironment,
  BuildMetadata,
  BuildRuntimeType,
} from "./types/build-metadata";

const UNKNOWN = "unknown";

export interface CreateBuildMetadataInput {
  runtimeType: BuildRuntimeType;
  appVersion?: string | null;
  gitSha?: string | null;
  buildDate?: string | null;
  buildChannel?: string | null;
  environment?: string | null;
  nodeEnv?: string | null;
}

export interface CreateBuildMetadataFromEnvInput {
  runtimeType: BuildRuntimeType;
  appVersion?: string | null;
}

function clean(value?: string | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstValue(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function normalizeEnvironment(
  environment?: string | null,
  nodeEnv?: string | null,
): BuildEnvironment {
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

function normalizeGitSha(gitSha?: string | null): {
  gitSha: string;
  gitShaShort: string;
} {
  const cleaned = clean(gitSha);
  if (!cleaned || cleaned === UNKNOWN) {
    return { gitSha: UNKNOWN, gitShaShort: UNKNOWN };
  }

  return {
    gitSha: cleaned,
    gitShaShort: cleaned.slice(0, 12),
  };
}

function normalizeBuildDate(buildDate?: string | null): string {
  const cleaned = clean(buildDate);
  if (!cleaned) return UNKNOWN;

  if (/^\d+$/.test(cleaned)) {
    const date = new Date(Number(cleaned) * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  return cleaned;
}

function createReleaseName(input: {
  runtimeType: BuildRuntimeType;
  appVersion: string;
  gitShaShort: string;
}) {
  const shaSuffix =
    input.gitShaShort && input.gitShaShort !== UNKNOWN
      ? `+${input.gitShaShort}`
      : "";
  return `streamer-${input.runtimeType}@${input.appVersion}${shaSuffix}`;
}

export function createBuildMetadata(
  input: CreateBuildMetadataInput,
): BuildMetadata {
  const environment = normalizeEnvironment(input.environment, input.nodeEnv);
  const appVersion = clean(input.appVersion) || UNKNOWN;
  const { gitSha, gitShaShort } = normalizeGitSha(input.gitSha);
  const buildChannel =
    clean(input.buildChannel) ||
    (environment === "production" ? "production" : environment);

  return {
    appVersion,
    gitSha,
    gitShaShort,
    buildDate: normalizeBuildDate(input.buildDate),
    buildChannel,
    runtimeType: input.runtimeType,
    environment,
    release: createReleaseName({
      runtimeType: input.runtimeType,
      appVersion,
      gitShaShort,
    }),
  };
}

export function createBuildMetadataFromEnv(
  env: BuildEnvSource,
  input: CreateBuildMetadataFromEnvInput,
): BuildMetadata {
  return createBuildMetadata({
    runtimeType: input.runtimeType,
    appVersion: firstValue(
      env.STREAMER_APP_VERSION,
      env.EXPO_PUBLIC_STREAMER_APP_VERSION,
      input.appVersion,
      env.npm_package_version,
    ),
    gitSha: firstValue(
      env.STREAMER_GIT_SHA,
      env.EXPO_PUBLIC_STREAMER_GIT_SHA,
      env.GITHUB_SHA,
      env.VERCEL_GIT_COMMIT_SHA,
      env.EAS_BUILD_GIT_COMMIT_HASH,
    ),
    buildDate: firstValue(
      env.STREAMER_BUILD_DATE,
      env.EXPO_PUBLIC_STREAMER_BUILD_DATE,
      env.BUILD_DATE,
      env.SOURCE_DATE_EPOCH,
      env.EAS_BUILD_DATE,
    ),
    buildChannel: firstValue(
      env.STREAMER_BUILD_CHANNEL,
      env.EXPO_PUBLIC_STREAMER_BUILD_CHANNEL,
      env.EAS_BUILD_PROFILE,
      env.APP_ENV,
      env.NODE_ENV,
    ),
    environment: firstValue(
      env.STREAMER_BUILD_ENVIRONMENT,
      env.EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT,
      env.SENTRY_ENVIRONMENT,
      env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
      env.NODE_ENV,
    ),
    nodeEnv: env.NODE_ENV,
  });
}

export function buildMetadataToSentryTags(
  metadata: BuildMetadata,
): Record<string, string> {
  return {
    "streamer.runtime": metadata.runtimeType,
    "streamer.version": metadata.appVersion,
    "streamer.git_sha": metadata.gitSha,
    "streamer.git_sha_short": metadata.gitShaShort,
    "streamer.build_date": metadata.buildDate,
    "streamer.build_channel": metadata.buildChannel,
  };
}
