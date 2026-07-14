import Constants from "expo-constants";

export type MobileBuildEnvironment = "development" | "preview" | "production";

interface StreamerRuntimeExtra {
  apiUrl?: string;
  buildEnvironment?: MobileBuildEnvironment;
  buildChannel?: string;
  gitSha?: string;
  buildDate?: string;
  updates?: {
    enabled?: boolean;
    channel?: string;
  };
  sentry?: {
    dsn?: string;
    environment?: string;
    release?: string;
    tracesSampleRate?: string;
    errorSampleRate?: string;
    enableInDev?: string;
  };
}

export interface ClientRuntimeConfig {
  apiUrl?: string;
  buildEnvironment: MobileBuildEnvironment;
  buildChannel: string;
  gitSha?: string;
  buildDate?: string;
  updates: {
    enabled: boolean;
    channel: string;
  };
  sentry: {
    dsn?: string;
    environment?: string;
    release?: string;
    tracesSampleRate?: string;
    errorSampleRate?: string;
    enableInDev?: string;
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function resolveBuildEnvironment(value: unknown): MobileBuildEnvironment {
  return value === "preview" || value === "production" ? value : "development";
}

export function getClientRuntimeConfig(): ClientRuntimeConfig {
  const extra = (Constants.expoConfig?.extra?.streamer || {}) as
    | StreamerRuntimeExtra
    | undefined;
  const buildEnvironment = resolveBuildEnvironment(extra?.buildEnvironment);
  const buildChannel = optionalString(extra?.buildChannel) || buildEnvironment;

  return {
    apiUrl:
      optionalString(extra?.apiUrl) ||
      optionalString(process.env.EXPO_PUBLIC_API_URL),
    buildEnvironment,
    buildChannel,
    gitSha:
      optionalString(extra?.gitSha) ||
      optionalString(process.env.EXPO_PUBLIC_STREAMER_GIT_SHA),
    buildDate:
      optionalString(extra?.buildDate) ||
      optionalString(process.env.EXPO_PUBLIC_STREAMER_BUILD_DATE),
    updates: {
      enabled: extra?.updates?.enabled === true,
      channel: optionalString(extra?.updates?.channel) || buildChannel,
    },
    sentry: {
      dsn:
        optionalString(extra?.sentry?.dsn) ||
        optionalString(process.env.EXPO_PUBLIC_SENTRY_DSN),
      environment:
        optionalString(extra?.sentry?.environment) || buildEnvironment,
      release:
        optionalString(extra?.sentry?.release) ||
        optionalString(process.env.EXPO_PUBLIC_SENTRY_RELEASE),
      tracesSampleRate:
        optionalString(extra?.sentry?.tracesSampleRate) ||
        optionalString(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
      errorSampleRate:
        optionalString(extra?.sentry?.errorSampleRate) ||
        optionalString(process.env.EXPO_PUBLIC_SENTRY_ERROR_SAMPLE_RATE),
      enableInDev:
        optionalString(extra?.sentry?.enableInDev) ||
        optionalString(process.env.EXPO_PUBLIC_SENTRY_ENABLE_DEV),
    },
  };
}

export const clientRuntimeConfig = getClientRuntimeConfig();
