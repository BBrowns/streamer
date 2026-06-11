"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createDesktopSentryOptions,
  redactSensitiveText,
  redactSensitiveValue,
} = require("./sentry");

test("desktop sentry stays disabled without a DSN", () => {
  const options = createDesktopSentryOptions({
    NODE_ENV: "production",
    npm_package_version: "1.2.3",
  });

  assert.equal(options.enabled, false);
  assert.equal(options.dsn, "");
  assert.equal(options.release, "streamer-desktop-main@1.2.3");
});

test("desktop sentry stays disabled in development unless explicitly enabled", () => {
  const options = createDesktopSentryOptions({
    NODE_ENV: "development",
    STREAMER_DESKTOP_SENTRY_DSN: "https://example@sentry.io/1",
  });

  assert.equal(options.enabled, false);
});

test("desktop sentry release uses build metadata when provided", () => {
  const options = createDesktopSentryOptions(
    {
      NODE_ENV: "production",
      STREAMER_DESKTOP_SENTRY_DSN: "https://example@sentry.io/1",
    },
    {
      appVersion: "2.0.0",
      gitSha: "1234567890abcdef",
      gitShaShort: "1234567890ab",
      buildDate: "2026-06-11T10:00:00.000Z",
      buildChannel: "beta",
      runtimeType: "desktop-main",
      environment: "preview",
      release: "streamer-desktop-main@2.0.0+1234567890ab",
    },
  );

  assert.equal(options.environment, "preview");
  assert.equal(options.release, "streamer-desktop-main@2.0.0+1234567890ab");
});

test("desktop sentry can be enabled in production", () => {
  const options = createDesktopSentryOptions({
    NODE_ENV: "production",
    STREAMER_DESKTOP_SENTRY_DSN: "https://example@sentry.io/1",
    STREAMER_DESKTOP_SENTRY_ENVIRONMENT: "desktop-prod",
    STREAMER_DESKTOP_SENTRY_RELEASE: "desktop@abc123",
    STREAMER_DESKTOP_SENTRY_TRACES_SAMPLE_RATE: "0.25",
    STREAMER_DESKTOP_SENTRY_ERROR_SAMPLE_RATE: "2",
  });

  assert.equal(options.enabled, true);
  assert.equal(options.environment, "desktop-prod");
  assert.equal(options.release, "desktop@abc123");
  assert.equal(options.tracesSampleRate, 0.25);
  assert.equal(options.sampleRate, 1);
  assert.equal(options.sendDefaultPii, false);
});

test("desktop sentry can be explicitly enabled in development", () => {
  const options = createDesktopSentryOptions({
    NODE_ENV: "development",
    SENTRY_DSN: "https://example@sentry.io/1",
    SENTRY_ENABLE_DEV: "true",
  });

  assert.equal(options.enabled, true);
  assert.equal(options.tracesSampleRate, 0);
});

test("redacts sensitive URLs and headers from text", () => {
  const text = redactSensitiveText(
    "Bearer abc.def magnet:?xt=urn:btih:abc /api/gateway/jobs/job-1/stream?token=secret&x=1 /Users/alice/app",
  );

  assert.equal(
    text,
    "Bearer [redacted] [magnet] /api/gateway/jobs/job-1/stream?[signed] /Users/[redacted]/app",
  );
});

test("redacts nested sentry event payloads", () => {
  const redacted = redactSensitiveValue({
    message: "open magnet:?xt=urn:btih:abc",
    extra: {
      authorization: "Bearer secret",
      downloadUrl: "https://resolver.test/file.mp4?token=abc",
      nodeExecutable: "/Users/alice/.nvm/versions/node/bin/node",
      nested: {
        api_key: "secret",
        url: "https://example.test/play?access_token=abc",
      },
    },
  });

  assert.equal(redacted.message, "open [magnet]");
  assert.equal(redacted.extra.authorization, "[redacted]");
  assert.equal(redacted.extra.downloadUrl, "[redacted]");
  assert.equal(redacted.extra.nodeExecutable, "[redacted]");
  assert.equal(redacted.extra.nested.api_key, "[redacted]");
  assert.equal(
    redacted.extra.nested.url,
    "https://example.test/play?access_token=[redacted]",
  );
});

test("redacts sentry events through beforeSend and breadcrumbs", () => {
  const options = createDesktopSentryOptions({
    NODE_ENV: "production",
    STREAMER_DESKTOP_SENTRY_DSN: "https://example@sentry.io/1",
  });

  const event = options.beforeSend({
    message: "Bearer abc",
    extra: { streamUrl: "https://resolver.test/video.mp4?signature=abc" },
  });
  const breadcrumb = options.beforeBreadcrumb({
    message: "magnet:?xt=urn:btih:abc",
  });

  assert.equal(event.message, "Bearer [redacted]");
  assert.equal(event.extra.streamUrl, "[redacted]");
  assert.equal(breadcrumb.message, "[magnet]");
});
