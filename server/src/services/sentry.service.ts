import * as Sentry from "@sentry/node";
import { env } from "../config/env.js";
import { redactSensitiveLogValue } from "../utils/redaction.js";

type SentryRecord = Record<string, unknown>;

export interface ServerSentryConfigInput {
  dsn?: string;
  nodeEnv: "development" | "production" | "test";
  enableDev?: boolean;
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

function isPlainObject(value: unknown): value is SentryRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function sanitizeEvent(event: Sentry.Event): Sentry.Event {
  const sanitized = redactSensitiveLogValue(event) as Sentry.Event;
  const record = sanitized as SentryRecord;

  if (isPlainObject(record.user)) {
    record.user = record.user.id ? { id: String(record.user.id) } : undefined;
  }

  return sanitized;
}

function sanitizeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  return redactSensitiveLogValue(breadcrumb) as Sentry.Breadcrumb;
}

export function createServerSentryOptionsFromInput(
  input: ServerSentryConfigInput,
): Sentry.NodeOptions {
  const dsn = input.dsn?.trim() ?? "";
  const enabled =
    Boolean(dsn) &&
    input.nodeEnv !== "test" &&
    (input.nodeEnv === "production" || input.enableDev === true);

  const beforeSend: NonNullable<Sentry.NodeOptions["beforeSend"]> = (event) =>
    sanitizeEvent(event) as unknown as Sentry.ErrorEvent;
  const beforeBreadcrumb: NonNullable<
    Sentry.NodeOptions["beforeBreadcrumb"]
  > = (breadcrumb) => sanitizeBreadcrumb(breadcrumb);

  return {
    dsn,
    enabled,
    environment: input.environment || input.nodeEnv,
    release:
      input.release || `streamer-server@${input.packageVersion ?? "unknown"}`,
    debug: false,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    sampleRate: parseSampleRate(input.errorSampleRate, 1),
    tracesSampleRate: parseSampleRate(
      input.tracesSampleRate,
      input.nodeEnv === "production" ? 0.05 : 0,
    ),
    beforeSend,
    beforeBreadcrumb,
  };
}

export function createServerSentryOptions(): Sentry.NodeOptions {
  return createServerSentryOptionsFromInput({
    dsn: env.sentry.dsn,
    nodeEnv: env.nodeEnv,
    enableDev: env.sentry.enableDev,
    environment: env.sentry.environment,
    release: env.sentry.release,
    tracesSampleRate: env.sentry.tracesSampleRate,
    errorSampleRate: env.sentry.errorSampleRate,
    packageVersion: process.env.npm_package_version,
  });
}

export function initServerSentry(): void {
  Sentry.init(createServerSentryOptions());
}

export function captureServerException(
  error: unknown,
  context?: SentryRecord,
): void {
  const sanitizedContext = context
    ? (redactSensitiveLogValue(context) as SentryRecord)
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

export async function flushServerSentry(timeoutMs = 2000): Promise<void> {
  await Sentry.flush(timeoutMs);
}
