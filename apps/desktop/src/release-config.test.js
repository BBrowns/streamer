"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const validator = path.resolve(
  __dirname,
  "../scripts/validate-release-config.cjs",
);

function releaseEnvironment(overrides = {}) {
  const {
    STREAMER_APP_VERSION: _appVersion,
    STREAMER_GIT_SHA: _gitSha,
    STREAMER_BUILD_CHANNEL: _channel,
    STREAMER_BUILD_ENVIRONMENT: _environment,
    ...base
  } = process.env;
  return { ...base, ...overrides };
}

test("release validation rejects unstamped production metadata", () => {
  const result = spawnSync(
    process.execPath,
    [validator, "--require-build-metadata"],
    {
      encoding: "utf8",
      env: releaseEnvironment(),
    },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Product version must be stamped/);
  assert.match(result.stderr, /Git SHA must be stamped/);
  assert.match(result.stderr, /Build channel must be stamped/);
});

test("release validation accepts complete production metadata", () => {
  const result = spawnSync(
    process.execPath,
    [validator, "--require-build-metadata"],
    {
      encoding: "utf8",
      env: releaseEnvironment({
        STREAMER_APP_VERSION: "0.1.0",
        STREAMER_GIT_SHA: "0123456789abcdef",
        STREAMER_BUILD_CHANNEL: "rc",
        STREAMER_BUILD_ENVIRONMENT: "production",
      }),
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /stamped build metadata are valid/);
});
