const BUILD_ENVIRONMENTS = new Set(["development", "preview", "production"]);
const DEFAULT_CHANNELS = {
  development: "development",
  preview: "preview",
  production: "production",
};
const PLACEHOLDER_PATTERN = /your[-_ ]|change[-_ ]?me|placeholder|<[^>]+>/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalValue(value) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

function assertNotPlaceholder(name, value) {
  if (value && PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(`${name} contains a placeholder value.`);
  }
}

function parseUrl(name, value, options = {}) {
  const normalized = optionalValue(value);
  if (!normalized) {
    if (options.required) throw new Error(`${name} is required.`);
    return undefined;
  }

  assertNotPlaceholder(name, normalized);

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  if ((!options.allowUsername && parsed.username) || parsed.password) {
    throw new Error(`${name} must not contain credentials.`);
  }
  if (options.httpsOnly && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS for release builds.`);
  }

  return parsed.toString().replace(/\/$/, "");
}

function resolveEnvironment(env) {
  const value =
    optionalValue(env.STREAMER_BUILD_ENVIRONMENT) ||
    optionalValue(env.EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT) ||
    "development";
  if (!BUILD_ENVIRONMENTS.has(value)) {
    throw new Error(
      `STREAMER_BUILD_ENVIRONMENT must be development, preview, or production (received ${value}).`,
    );
  }
  return value;
}

function resolveSentry(env, environment, version) {
  const required = environment === "production";
  const dsn = parseUrl("EXPO_PUBLIC_SENTRY_DSN", env.EXPO_PUBLIC_SENTRY_DSN, {
    required,
    httpsOnly: environment !== "development",
    allowUsername: true,
  });
  const organization = optionalValue(env.SENTRY_ORG);
  const project = optionalValue(env.SENTRY_PROJECT);

  assertNotPlaceholder("SENTRY_ORG", organization);
  assertNotPlaceholder("SENTRY_PROJECT", project);

  if (required && (!organization || !project)) {
    throw new Error(
      "SENTRY_ORG and SENTRY_PROJECT are required for production builds.",
    );
  }
  if (Boolean(organization) !== Boolean(project)) {
    throw new Error(
      "SENTRY_ORG and SENTRY_PROJECT must be configured together.",
    );
  }

  const release =
    optionalValue(env.EXPO_PUBLIC_SENTRY_RELEASE) ||
    `streamer-mobile@${version}`;
  assertNotPlaceholder("EXPO_PUBLIC_SENTRY_RELEASE", release);

  return {
    dsn,
    organization,
    project,
    environment:
      optionalValue(env.EXPO_PUBLIC_SENTRY_ENVIRONMENT) || environment,
    release,
    tracesSampleRate: optionalValue(env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE),
    errorSampleRate: optionalValue(env.EXPO_PUBLIC_SENTRY_ERROR_SAMPLE_RATE),
    enableInDev: optionalValue(env.EXPO_PUBLIC_SENTRY_ENABLE_DEV),
  };
}

function resolveMobileAppConfig(baseConfig, env = process.env) {
  const environment = resolveEnvironment(env);
  const releaseBuild = environment !== "development";
  const channel =
    optionalValue(env.EXPO_PUBLIC_STREAMER_BUILD_CHANNEL) ||
    DEFAULT_CHANNELS[environment];
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(channel)) {
    throw new Error("EXPO_PUBLIC_STREAMER_BUILD_CHANNEL is invalid.");
  }

  const apiUrl = parseUrl("EXPO_PUBLIC_API_URL", env.EXPO_PUBLIC_API_URL, {
    required: releaseBuild,
    httpsOnly: releaseBuild,
  });
  const projectId =
    optionalValue(env.EAS_PROJECT_ID) ||
    optionalValue(env.EXPO_PUBLIC_EAS_PROJECT_ID);
  if (releaseBuild && !projectId) {
    throw new Error("EAS_PROJECT_ID is required for preview and production.");
  }
  if (projectId && !UUID_PATTERN.test(projectId)) {
    throw new Error("EAS_PROJECT_ID must be a UUID.");
  }

  const version = baseConfig.version || "1.0.0";
  const sentry = resolveSentry(env, environment, version);
  const plugins = (baseConfig.plugins || []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== "@sentry/react-native";
  });
  if (sentry.organization && sentry.project) {
    plugins.push([
      "@sentry/react-native",
      {
        organization: sentry.organization,
        project: sentry.project,
      },
    ]);
  }

  const updatesEnabled = Boolean(projectId);
  const extra = {
    ...(baseConfig.extra || {}),
    ...(projectId
      ? {
          eas: {
            ...(baseConfig.extra?.eas || {}),
            projectId,
          },
        }
      : {}),
    streamer: {
      apiUrl,
      buildEnvironment: environment,
      buildChannel: channel,
      gitSha: optionalValue(env.EXPO_PUBLIC_STREAMER_GIT_SHA),
      buildDate: optionalValue(env.EXPO_PUBLIC_STREAMER_BUILD_DATE),
      updates: {
        enabled: updatesEnabled,
        channel,
      },
      sentry: {
        dsn: sentry.dsn,
        environment: sentry.environment,
        release: sentry.release,
        tracesSampleRate: sentry.tracesSampleRate,
        errorSampleRate: sentry.errorSampleRate,
        enableInDev: sentry.enableInDev,
      },
    },
  };

  return {
    ...baseConfig,
    name: "Streamer",
    slug: "streamer",
    scheme: "streamer",
    plugins,
    runtimeVersion: { policy: "appVersion" },
    updates: updatesEnabled
      ? {
          ...(baseConfig.updates || {}),
          enabled: true,
          url: `https://u.expo.dev/${projectId}`,
          checkAutomatically: "ON_LOAD",
          fallbackToCacheTimeout: 0,
        }
      : {
          ...(baseConfig.updates || {}),
          enabled: false,
        },
    extra,
  };
}

module.exports = {
  DEFAULT_CHANNELS,
  resolveMobileAppConfig,
};
