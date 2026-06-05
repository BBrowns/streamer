const REDACTED = "[redacted]";
const REDACTED_URL = "[url]";
const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(access|refresh|reset|verification|bridge|gateway)?(token|secret|password|signature|authorization|credential|apikey|api_key)([_-]|$)|^(auth|bearer)$/i;
const SENSITIVE_VALUE_KEY_PATTERN =
  /^(magnet|playbackUrl|streamUrl|sourceUrl|downloadUrl|externalUrl|localUri|uri|infoHash)$/i;

export function redactSensitiveText(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/magnet:\?[^\s"'<>]+/gi, "[magnet]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
      if (
        /[?&](token|access_token|refresh_token|signature|auth|authorization|key|api_key)=/i.test(
          match,
        ) ||
        /\/api\/gateway\/jobs\/[^/]+\/stream/i.test(match)
      ) {
        try {
          const parsed = new URL(match);
          if (
            parsed.pathname.includes("/api/gateway/jobs/") &&
            parsed.pathname.endsWith("/stream")
          ) {
            parsed.pathname = "/api/gateway/jobs/[job]/stream";
            parsed.search = parsed.search ? "?[signed]" : "";
            return parsed.toString();
          }
        } catch {
          return REDACTED_URL;
        }
      }
      return REDACTED_URL;
    })
    .replace(
      /([?&](?:token|access_token|refresh_token|signature|auth|authorization|key|api_key)=)[^&\s]+/gi,
      "$1[redacted]",
    );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function redactSensitiveValue(
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

  if (value instanceof Error) {
    return {
      type: value.name,
      message: redactSensitiveText(value.message),
      stack: value.stack ? redactSensitiveText(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => redactSensitiveValue(item, key, depth + 1));
  }

  if (!isPlainObject(value)) {
    return redactSensitiveText(String(value));
  }

  const redacted: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (
      SENSITIVE_KEY_PATTERN.test(entryKey) ||
      SENSITIVE_VALUE_KEY_PATTERN.test(entryKey)
    ) {
      redacted[entryKey] = REDACTED;
      continue;
    }

    redacted[entryKey] = redactSensitiveValue(entryValue, entryKey, depth + 1);
  }
  return redacted;
}
