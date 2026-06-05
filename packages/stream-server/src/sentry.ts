import * as Sentry from "@sentry/node";
import { redactSensitiveValue } from "./redaction.js";

type SentryRecord = Record<string, unknown>;

export interface StreamServerSentryConfigInput {
  dsn?: string;
  nodeEnv?: string;
  enableDev?: string;
  environment?: string;
  release?: string;
  errorSampleRate?: string;
  tracesSampleRate?: string;
  packageVersion?: string;
}

function parseSampleRate(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1, Math.max(0, parsed));
}

function isEnabledFlag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").toLowerCase());
}

function isPlainObject(value: unknown): value is SentryRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function sanitizeEvent(event: Sentry.Event): Sentry.Event {
  const sanitized = redactSensitiveValue(event) as Sentry.Event;
  const record = sanitized as SentryRecord;

  if (isPlainObject(record.user)) {
    record.user = record.user.id ? { id: String(record.user.id) } : undefined;
  }

  return sanitized;
}

function sanitizeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  return redactSensitiveValue(breadcrumb) as Sentry.Breadcrumb;
}

export function createStreamServerSentryOptionsFromInput(
  input: StreamServerSentryConfigInput,
): Sentry.NodeOptions {
  const dsn = input.dsn?.trim() ?? "";
  const nodeEnv = input.nodeEnv || "development";
  const enabled =
    Boolean(dsn) &&
    nodeEnv !== "test" &&
    (nodeEnv === "production" || isEnabledFlag(input.enableDev));

  const beforeSend: NonNullable<Sentry.NodeOptions["beforeSend"]> = (event) =>
    sanitizeEvent(event) as unknown as Sentry.ErrorEvent;
  const beforeBreadcrumb: NonNullable<
    Sentry.NodeOptions["beforeBreadcrumb"]
  > = (breadcrumb) => sanitizeBreadcrumb(breadcrumb);

  return {
    dsn,
    enabled,
    environment: input.environment || nodeEnv,
    release:
      input.release ||
      `streamer-stream-server@${input.packageVersion ?? "unknown"}`,
    debug: false,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    sampleRate: parseSampleRate(input.errorSampleRate, 1),
    tracesSampleRate: parseSampleRate(
      input.tracesSampleRate,
      nodeEnv === "production" ? 0.05 : 0,
    ),
    beforeSend,
    beforeBreadcrumb,
  };
}

export function createStreamServerSentryOptions(): Sentry.NodeOptions {
  return createStreamServerSentryOptionsFromInput({
    dsn: process.env.STREAMER_BRIDGE_SENTRY_DSN || process.env.SENTRY_DSN,
    nodeEnv: process.env.NODE_ENV,
    enableDev:
      process.env.STREAMER_BRIDGE_SENTRY_ENABLE_DEV ||
      process.env.SENTRY_ENABLE_DEV,
    environment:
      process.env.STREAMER_BRIDGE_SENTRY_ENVIRONMENT ||
      process.env.SENTRY_ENVIRONMENT,
    release:
      process.env.STREAMER_BRIDGE_SENTRY_RELEASE || process.env.SENTRY_RELEASE,
    tracesSampleRate:
      process.env.STREAMER_BRIDGE_SENTRY_TRACES_SAMPLE_RATE ||
      process.env.SENTRY_TRACES_SAMPLE_RATE,
    errorSampleRate:
      process.env.STREAMER_BRIDGE_SENTRY_ERROR_SAMPLE_RATE ||
      process.env.SENTRY_ERROR_SAMPLE_RATE,
    packageVersion: process.env.npm_package_version,
  });
}

export function initStreamServerSentry(): void {
  Sentry.init(createStreamServerSentryOptions());
}

export function captureStreamServerException(
  error: unknown,
  context?: SentryRecord,
): void {
  const sanitizedContext = context
    ? (redactSensitiveValue(context) as SentryRecord)
    : undefined;

  Sentry.withScope((scope) => {
    if (sanitizedContext) {
      for (const [key, value] of Object.entries(sanitizedContext)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(error);
  });
}

export async function flushStreamServerSentry(timeoutMs = 2000): Promise<void> {
  await Sentry.flush(timeoutMs);
}
