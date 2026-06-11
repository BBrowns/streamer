"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildMetadataToSentryTags,
  createDesktopBuildMetadata,
} = require("./build-metadata");

test("desktop build metadata resolves version, channel, sha, and release", () => {
  const metadata = createDesktopBuildMetadata(
    {
      NODE_ENV: "production",
      STREAMER_APP_VERSION: "1.2.3",
      STREAMER_GIT_SHA: "1234567890abcdef",
      STREAMER_BUILD_DATE: "2026-06-11T10:00:00.000Z",
      STREAMER_BUILD_CHANNEL: "beta",
      STREAMER_BUILD_ENVIRONMENT: "staging",
    },
    { appVersion: "9.9.9" },
  );

  assert.deepEqual(metadata, {
    appVersion: "1.2.3",
    gitSha: "1234567890abcdef",
    gitShaShort: "1234567890ab",
    buildDate: "2026-06-11T10:00:00.000Z",
    buildChannel: "beta",
    runtimeType: "desktop-main",
    environment: "preview",
    release: "streamer-desktop-main@1.2.3+1234567890ab",
  });
});

test("desktop build metadata tags are Sentry-safe", () => {
  const metadata = createDesktopBuildMetadata(
    {
      NODE_ENV: "production",
      STREAMER_APP_VERSION: "1.2.3",
      STREAMER_GIT_SHA: "abcdef",
    },
    {},
  );

  assert.deepEqual(buildMetadataToSentryTags(metadata), {
    "streamer.runtime": "desktop-main",
    "streamer.version": "1.2.3",
    "streamer.git_sha": "abcdef",
    "streamer.git_sha_short": "abcdef",
    "streamer.build_date": "unknown",
    "streamer.build_channel": "production",
  });
});
