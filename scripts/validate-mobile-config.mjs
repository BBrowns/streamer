#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = join(repoRoot, "apps/mobile");
const expoCli = join(repoRoot, "node_modules/expo/bin/cli");
const appJson = require(join(mobileRoot, "app.json")).expo;
const easConfig = require(join(mobileRoot, "eas.json"));
const { resolveMobileAppConfig } = require(
  join(mobileRoot, "config/mobileAppConfig.js"),
);

const projectId = "00000000-0000-4000-8000-000000000146";
const profileEnvironments = {
  development: {
    STREAMER_BUILD_ENVIRONMENT: "development",
    EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT: "development",
    EXPO_PUBLIC_STREAMER_BUILD_CHANNEL: "development",
  },
  preview: {
    STREAMER_BUILD_ENVIRONMENT: "preview",
    EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT: "preview",
    EXPO_PUBLIC_STREAMER_BUILD_CHANNEL: "preview",
    EXPO_PUBLIC_API_URL: "https://preview-api.streamer.invalid",
    EAS_PROJECT_ID: projectId,
  },
  production: {
    STREAMER_BUILD_ENVIRONMENT: "production",
    EXPO_PUBLIC_STREAMER_BUILD_ENVIRONMENT: "production",
    EXPO_PUBLIC_STREAMER_BUILD_CHANNEL: "production",
    EXPO_PUBLIC_API_URL: "https://api.streamer.invalid",
    EAS_PROJECT_ID: projectId,
    EXPO_PUBLIC_SENTRY_DSN: "https://public@o0.ingest.sentry.io/1",
    SENTRY_ORG: "bbrowns-ci",
    SENTRY_PROJECT: "streamer-ci",
  },
};

function runExpoConfig(profile, profileEnvironment) {
  const result = spawnSync(
    process.execPath,
    [expoCli, "config", "--type", "public", "--json"],
    {
      cwd: mobileRoot,
      env: {
        ...process.env,
        ...profileEnvironment,
        EAS_BUILD_PROFILE: profile,
      },
      encoding: "utf8",
    },
  );

  assert.equal(
    result.status,
    0,
    `Expo config failed for ${profile}: ${result.stderr || result.stdout}`,
  );

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `Expo config returned invalid JSON for ${profile}: ${error.message}`,
    );
  }
}

function assertStableIdentity(config, profile) {
  assert.equal(config.name, "Streamer", `${profile} app name`);
  assert.equal(config.slug, "streamer", `${profile} slug`);
  assert.equal(config.scheme, "streamer", `${profile} scheme`);
  assert.equal(
    config.ios?.bundleIdentifier,
    "com.bbrowns.streamer",
    `${profile} iOS bundle identifier`,
  );
  assert.equal(
    config.android?.package,
    "com.bbrowns.streamer",
    `${profile} Android package`,
  );
  assert.deepEqual(
    config.runtimeVersion,
    { policy: "appVersion" },
    `${profile} runtime version policy`,
  );
}

for (const [profile, profileEnvironment] of Object.entries(
  profileEnvironments,
)) {
  const config = runExpoConfig(profile, profileEnvironment);
  const profileConfig = easConfig.build[profile];

  assertStableIdentity(config, profile);
  assert.equal(profileConfig.environment, profile);
  assert.equal(profileConfig.channel, profile);
  assert.equal(profileConfig.node, "24.18.0");
  assert.equal(config.extra.streamer.buildEnvironment, profile);
  assert.equal(config.extra.streamer.buildChannel, profile);
  assert.equal(config.extra.streamer.updates.channel, profile);

  if (profile === "development") {
    assert.equal(config.updates.enabled, false);
    assert.equal(config.extra.streamer.updates.enabled, false);
  } else {
    assert.equal(config.updates.enabled, true);
    assert.equal(config.updates.url, `https://u.expo.dev/${projectId}`);
    assert.equal(config.extra.eas.projectId, projectId);
  }

  if (profile === "production") {
    const sentryPlugin = config.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "@sentry/react-native",
    );
    assert.ok(sentryPlugin, "production Sentry plugin must be configured");
    assert.equal(sentryPlugin[1].organization, "bbrowns-ci");
    assert.equal(sentryPlugin[1].project, "streamer-ci");
  }
}

assert.equal(easConfig.cli.appVersionSource, "remote");
assert.equal(easConfig.build.development.developmentClient, true);
assert.equal(easConfig.build.preview.autoIncrement, true);
assert.equal(easConfig.build.production.autoIncrement, true);
assert.equal(easConfig.build.production.distribution, "store");

assert.throws(
  () =>
    resolveMobileAppConfig(appJson, {
      STREAMER_BUILD_ENVIRONMENT: "production",
    }),
  /EXPO_PUBLIC_API_URL is required/,
);
assert.throws(
  () =>
    resolveMobileAppConfig(appJson, {
      STREAMER_BUILD_ENVIRONMENT: "production",
      EXPO_PUBLIC_API_URL: "http://api.streamer.invalid",
      EAS_PROJECT_ID: projectId,
      EXPO_PUBLIC_SENTRY_DSN: "https://public@o0.ingest.sentry.io/1",
      SENTRY_ORG: "bbrowns-ci",
      SENTRY_PROJECT: "streamer-ci",
    }),
  /must use HTTPS/,
);
assert.throws(
  () =>
    resolveMobileAppConfig(appJson, {
      STREAMER_BUILD_ENVIRONMENT: "production",
      EXPO_PUBLIC_API_URL: "https://api.streamer.invalid",
      EAS_PROJECT_ID: projectId,
      EXPO_PUBLIC_SENTRY_DSN: "https://public@o0.ingest.sentry.io/1",
      SENTRY_ORG: "your-organization",
      SENTRY_PROJECT: "streamer",
    }),
  /placeholder/,
);
assert.throws(
  () =>
    resolveMobileAppConfig(appJson, {
      STREAMER_BUILD_ENVIRONMENT: "preview",
      EXPO_PUBLIC_API_URL: "https://preview-api.streamer.invalid",
      EAS_PROJECT_ID: projectId,
      SENTRY_ORG: "bbrowns-ci",
    }),
  /configured together/,
);

console.log(
  "Mobile config validation passed for development, preview, and production.",
);
