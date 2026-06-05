import type {
  Breadcrumb,
  ErrorEvent,
  ReactNativeOptions,
} from "@sentry/react-native";
import { redactSensitiveText } from "./redaction";

type SentryRecord = Record<string, unknown>;

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(access|refresh|reset|verification|bridge|gateway)?(token|secret|password|signature|authorization|credential|apikey|api_key)([_-]|$)|^(auth|bearer)$/i;
const SENSITIVE_VALUE_KEY_PATTERN =
  /^(magnet|playbackUrl|streamUrl|sourceUrl|downloadUrl|externalUrl|localUri|uri|infoHash)$/i;

export interface MobileSentryConfigInput {
  dsn?: string;
  appVersion?: string | null;
  environment?: string;
  release?: string;
  tracesSampleRate?: string;
  sampleRate?: string;
  enableInDev?: string;
  isDev: boolean;
  nodeEnv?: string;
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

export function redactSentryValue(
  value: unknown,
  key = "",
  depth = 0,
): unknown {
  if (depth > 8) return "[redacted-depth]";

  if (typeof value === "string") {
    if (
      SENSITIVE_KEY_PATTERN.test(key) ||
      SENSITIVE_VALUE_KEY_PATTERN.test(key)
    ) {
      return REDACTED;
    }
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "undefined"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => redactSentryValue(item, key, depth + 1));
  }

  if (!isPlainObject(value)) {
    return redactSensitiveText(String(value));
  }

  const redacted: SentryRecord = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (
      SENSITIVE_KEY_PATTERN.test(entryKey) ||
      SENSITIVE_VALUE_KEY_PATTERN.test(entryKey)
    ) {
      redacted[entryKey] = REDACTED;
      continue;
    }

    redacted[entryKey] = redactSentryValue(entryValue, entryKey, depth + 1);
  }
  return redacted;
}

export function sanitizeSentryEvent<T extends SentryRecord>(event: T): T {
  const sanitized = redactSentryValue(event) as T;
  const sanitizedRecord = sanitized as SentryRecord;

  if (isPlainObject(sanitizedRecord.user)) {
    sanitizedRecord.user = sanitizedRecord.user.id
      ? { id: String(sanitizedRecord.user.id) }
      : undefined;
  }

  return sanitized;
}

export function sanitizeSentryBreadcrumb<T extends SentryRecord>(
  breadcrumb: T,
): T | null {
  return redactSentryValue(breadcrumb) as T;
}

export function createMobileSentryConfig(
  input: MobileSentryConfigInput,
): ReactNativeOptions {
  const dsn = input.dsn?.trim() ?? "";
  const enabled =
    Boolean(dsn) &&
    input.nodeEnv !== "test" &&
    (!input.isDev || input.enableInDev === "true");
  const environment =
    input.environment?.trim() || (input.isDev ? "development" : "production");
  const release =
    input.release?.trim() ||
    `streamer-mobile@${input.appVersion?.trim() || "unknown"}`;

  const beforeSend: NonNullable<ReactNativeOptions["beforeSend"]> = (event) =>
    sanitizeSentryEvent(
      event as unknown as SentryRecord,
    ) as unknown as ErrorEvent;
  const beforeBreadcrumb: NonNullable<
    ReactNativeOptions["beforeBreadcrumb"]
  > = (breadcrumb) =>
    sanitizeSentryBreadcrumb(
      breadcrumb as unknown as SentryRecord,
    ) as unknown as Breadcrumb | null;

  return {
    dsn,
    enabled,
    environment,
    release,
    debug: false,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    tracesSampleRate: parseSampleRate(
      input.tracesSampleRate,
      input.isDev ? 0 : 0.1,
    ),
    sampleRate: parseSampleRate(input.sampleRate, 1),
    beforeSend,
    beforeBreadcrumb,
  };
}
