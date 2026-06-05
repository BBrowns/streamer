const REDACTED = "[redacted]";
const REDACTED_URL = "[url]";

const SENSITIVE_KEY_PATTERN =
  /(^|[_-])(access|refresh|reset|verification|bridge|gateway)?(token|secret|password|signature|authorization|credential|apikey|api_key)([_-]|$)|^(auth|bearer)$/i;
const SENSITIVE_VALUE_KEY_PATTERN =
  /^(magnet|playbackUrl|streamUrl|sourceUrl|downloadUrl|externalUrl|localUri|uri|infoHash)$/i;
const URL_KEY_PATTERN = /^(url|requestUrl)$/i;
const SENSITIVE_QUERY_PARAM_PATTERN =
  /^(token|access_token|refresh_token|resetToken|verificationToken|signature|auth|authorization|key|api_key)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

function redactUrlPreservingRoute(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_PARAM_PATTERN.test(key)) {
        parsed.searchParams.set(key, REDACTED);
      }
    }

    if (
      parsed.pathname.includes("/api/gateway/jobs/") &&
      parsed.pathname.endsWith("/stream")
    ) {
      parsed.pathname = "/api/gateway/jobs/[job]/stream";
      parsed.search = parsed.search ? "?[signed]" : "";
    }

    return parsed.toString();
  } catch {
    return redactSensitiveText(urlString);
  }
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /x-streamer-bridge-token:\s*[^\s,;]+/gi,
      `x-streamer-bridge-token: ${REDACTED}`,
    )
    .replace(/magnet:\?[^\s"'<>]+/gi, "[magnet]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match): string => {
      if (
        /[?&](token|access_token|refresh_token|signature|auth|authorization|key|api_key)=/i.test(
          match,
        ) ||
        /\/api\/gateway\/jobs\/[^/]+\/stream/i.test(match)
      ) {
        return redactUrlPreservingRoute(match);
      }
      return REDACTED_URL;
    })
    .replace(
      /([?&](?:token|access_token|refresh_token|signature|auth|authorization|key|api_key)=)[^&\s]+/gi,
      `$1${REDACTED}`,
    );
}

export function redactSensitiveLogValue(
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
    if (URL_KEY_PATTERN.test(key)) {
      return redactUrlPreservingRoute(value);
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
      .map((item) => redactSensitiveLogValue(item, key, depth + 1));
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
    } else {
      redacted[entryKey] = redactSensitiveLogValue(
        entryValue,
        entryKey,
        depth + 1,
      );
    }
  }
  return redacted;
}
