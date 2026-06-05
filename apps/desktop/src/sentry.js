"use strict";

let Sentry = null;

try {
  Sentry = require("@sentry/electron/main");
} catch {
  Sentry = null;
}

const SENSITIVE_KEY_PATTERN =
  /^(authorization|auth|bearer|token|access_token|refresh_token|signature|secret|password|api_key|key)$/i;
const SENSITIVE_VALUE_KEY_PATTERN =
  /^(magnet|playbackUrl|streamUrl|sourceUrl|downloadUrl|externalUrl|localUri|uri|infoHash|filePath|tempPath|nodeExecutable|entrypoint|nativeBinary)$/i;

function redactSensitiveText(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/magnet:\?[^\s"'<>]+/gi, "[magnet]")
    .replace(
      /(\/api\/gateway\/jobs\/[^/\s]+\/stream)\?[^\s"'<>]+/gi,
      "$1?[signed]",
    )
    .replace(
      /([?&](?:token|access_token|refresh_token|signature|auth|authorization|key|api_key)=)[^&\s]+/gi,
      "$1[redacted]",
    )
    .replace(/\/Users\/[^/\s"'<>]+/g, "/Users/[redacted]")
    .replace(/\/home\/[^/\s"'<>]+/g, "/home/[redacted]")
    .replace(/(C:\\Users\\)[^\\\s"'<>]+/gi, "$1[redacted]");
}

function isEnabledFlag(value) {
  return ["1", "true", "yes", "on"].includes(
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
}

function parseSampleRate(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function redactSensitiveValue(value, key = "", depth = 0) {
  if (depth > 6) return "[truncated]";

  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveText(value.message),
      stack: redactSensitiveText(value.stack),
    };
  }

  if (typeof value === "string") {
    if (SENSITIVE_VALUE_KEY_PATTERN.test(key)) return "[redacted]";
    return redactSensitiveText(value);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => redactSensitiveValue(item, key, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactSensitiveValue(entryValue, entryKey, depth + 1),
      ]),
    );
  }

  return value;
}

function createDesktopSentryOptions(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const dsn = String(
    env.STREAMER_DESKTOP_SENTRY_DSN || env.SENTRY_DSN || "",
  ).trim();
  const enableDev = isEnabledFlag(
    env.STREAMER_DESKTOP_SENTRY_ENABLE_DEV || env.SENTRY_ENABLE_DEV,
  );
  const enabled =
    Boolean(dsn) &&
    nodeEnv !== "test" &&
    (nodeEnv === "production" || enableDev);

  return {
    dsn,
    enabled,
    environment:
      env.STREAMER_DESKTOP_SENTRY_ENVIRONMENT ||
      env.SENTRY_ENVIRONMENT ||
      nodeEnv,
    release:
      env.STREAMER_DESKTOP_SENTRY_RELEASE ||
      env.SENTRY_RELEASE ||
      `streamer-desktop@${env.npm_package_version || "unknown"}`,
    debug: false,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    sampleRate: parseSampleRate(
      env.STREAMER_DESKTOP_SENTRY_ERROR_SAMPLE_RATE ||
        env.SENTRY_ERROR_SAMPLE_RATE,
      1,
    ),
    tracesSampleRate: parseSampleRate(
      env.STREAMER_DESKTOP_SENTRY_TRACES_SAMPLE_RATE ||
        env.SENTRY_TRACES_SAMPLE_RATE,
      nodeEnv === "production" ? 0.05 : 0,
    ),
    beforeSend(event) {
      return redactSensitiveValue(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return redactSensitiveValue(breadcrumb);
    },
  };
}

function initDesktopSentry() {
  if (!Sentry?.init) return false;
  Sentry.init(createDesktopSentryOptions(process.env));
  return true;
}

function captureDesktopException(error, context = {}) {
  if (!Sentry?.withScope || !Sentry?.captureException) return;

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(redactSensitiveValue(context))) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(error);
  });
}

function captureDesktopMessage(message, context = {}) {
  if (!Sentry?.withScope || !Sentry?.captureMessage) return;

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(redactSensitiveValue(context))) {
      scope.setExtra(key, value);
    }
    Sentry.captureMessage(redactSensitiveText(message));
  });
}

function flushDesktopSentry(timeoutMs = 2000) {
  if (!Sentry?.flush) return Promise.resolve(false);
  return Sentry.flush(timeoutMs);
}

module.exports = {
  captureDesktopException,
  captureDesktopMessage,
  createDesktopSentryOptions,
  flushDesktopSentry,
  initDesktopSentry,
  redactSensitiveText,
  redactSensitiveValue,
};
