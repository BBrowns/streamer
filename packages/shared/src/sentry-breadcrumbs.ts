export type StreamerBreadcrumbCategory =
  | "playback"
  | "gateway"
  | "download"
  | "cast";

export type StreamerBreadcrumbLevel = "debug" | "info" | "warning" | "error";

export interface StreamerBreadcrumbInput {
  category: StreamerBreadcrumbCategory;
  message: string;
  level?: StreamerBreadcrumbLevel;
  data?: Record<string, unknown>;
}

export interface StreamerBreadcrumb {
  category: string;
  message: string;
  level: StreamerBreadcrumbLevel;
  data?: Record<string, unknown>;
}

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 240;
const MAX_ARRAY_LENGTH = 20;
const MAX_DEPTH = 6;
const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(access|refresh|reset|verification|bridge|gateway)?(token|secret|password|signature|authorization|credential|apikey|api_key)([_-]|$)|^(auth|bearer)$/i;
const SENSITIVE_VALUE_KEY_PATTERN =
  /^(magnet|playbackUrl|streamUrl|sourceUrl|downloadUrl|externalUrl|localUri|uri|url|requestUrl|filePath|tempPath|path|infoHash)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function truncate(value: string) {
  return value.length <= MAX_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_STRING_LENGTH - 3)}...`;
}

export function redactSentryBreadcrumbText(value: string): string {
  return truncate(
    value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(
        /x-streamer-bridge-token:\s*[^\s,;]+/gi,
        "x-streamer-bridge-token: [redacted]",
      )
      .replace(/magnet:\?[^\s"'<>]+/gi, "[magnet]")
      .replace(
        /https?:\/\/[^\s"'<>]*\/api\/gateway\/jobs\/[^/\s"'<>]+\/stream[^\s"'<>]*/gi,
        "/api/gateway/jobs/[job]/stream?[signed]",
      )
      .replace(/https?:\/\/[^\s"'<>]+/gi, "[url]")
      .replace(/\/Users\/[^/\s"'<>]+/g, "/Users/[redacted]")
      .replace(/\/home\/[^/\s"'<>]+/g, "/home/[redacted]")
      .replace(/(C:\\Users\\)[^\\\s"'<>]+/gi, "$1[redacted]")
      .replace(
        /([?&](?:token|access_token|refresh_token|signature|auth|authorization|key|api_key)=)[^&\s]+/gi,
        "$1[redacted]",
      ),
  );
}

export function sanitizeSentryBreadcrumbData(
  value: unknown,
  key = "",
  depth = 0,
): unknown {
  if (depth > MAX_DEPTH) return "[redacted-depth]";

  if (
    SENSITIVE_KEY_PATTERN.test(key) ||
    SENSITIVE_VALUE_KEY_PATTERN.test(key)
  ) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return redactSentryBreadcrumbText(value);
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
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeSentryBreadcrumbData(item, key, depth + 1));
  }

  if (!isPlainObject(value)) {
    return redactSentryBreadcrumbText(String(value));
  }

  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    redacted[entryKey] = sanitizeSentryBreadcrumbData(
      entryValue,
      entryKey,
      depth + 1,
    );
  }
  return redacted;
}

export function createStreamerBreadcrumb(
  input: StreamerBreadcrumbInput,
): StreamerBreadcrumb {
  const data = input.data
    ? (sanitizeSentryBreadcrumbData(input.data) as Record<string, unknown>)
    : undefined;

  return {
    category: `streamer.${input.category}`,
    message: redactSentryBreadcrumbText(input.message),
    level: input.level || "info",
    ...(data ? { data } : {}),
  };
}
